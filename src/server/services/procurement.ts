import { prisma } from "@/server/db";
import { AuthUser, assertOwner, assertWorker, AuthorizationError } from "@/server/policies";
import {
  ProcurementMode,
  ProcurementStatus,
  OfferStatus,
  RequestStatus,
  WorkerStatus,
  InvitationResponse,
} from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

// ─── Procurement Rounds ──────────────────────────────────────────────────────

export async function createProcurementRound(
  user: AuthUser,
  requestId: string,
  data: {
    mode: ProcurementMode;
    briefText?: string;
    deadline?: Date | string;
    budgetAgorot?: number;
    directWorkerId?: string;
    invitedWorkerIds?: string[];
    sharedAttachmentIds?: string[];
  }
) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: { include: { building: true } },
        category: true,
        procurements: { orderBy: { roundNumber: "desc" }, take: 1 },
      },
    });

    if (!request || (request.unit.building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (request.status !== RequestStatus.PROCUREMENT) {
      throw new Error("REQUEST_NOT_IN_PROCUREMENT_STATUS");
    }

    // Check if there is already an open/draft procurement round
    const existingActive = await tx.procurement.findFirst({
      where: {
        requestId,
        status: { in: [ProcurementStatus.DRAFT, ProcurementStatus.OPEN] },
      },
    });

    if (existingActive) {
      throw new Error("ACTIVE_PROCUREMENT_ALREADY_EXISTS");
    }

    // Direct mode validation
    if (data.mode === ProcurementMode.DIRECT) {
      if (!data.directWorkerId) {
        throw new Error("DIRECT_WORKER_REQUIRED");
      }

      // Check worker is approved and matches category and area
      const workerProfile = await tx.workerProfile.findUnique({
        where: { userId: data.directWorkerId },
        include: { categories: true, areas: true },
      });

      if (!workerProfile || workerProfile.status !== WorkerStatus.APPROVED) {
        throw new Error("WORKER_NOT_APPROVED");
      }

      const matchesCat = workerProfile.categories.some((c) => c.categoryId === request.categoryId);
      if (!matchesCat) {
        throw new Error("WORKER_CATEGORY_MISMATCH");
      }
    }

    // Invited mode validation
    if (data.mode === ProcurementMode.INVITED) {
      if (!data.invitedWorkerIds || data.invitedWorkerIds.length === 0) {
        throw new Error("INVITED_WORKERS_REQUIRED");
      }
    }

    const nextRoundNumber = (request.procurements[0]?.roundNumber || 0) + 1;

    const procurement = await tx.procurement.create({
      data: {
        requestId,
        roundNumber: nextRoundNumber,
        mode: data.mode,
        status: ProcurementStatus.OPEN,
        briefText: data.briefText || request.description,
        categorySnapshot: request.category.nameEn,
        areaSnapshot: request.unit.building.address,
        deadline: data.deadline ? new Date(data.deadline) : null,
        budgetAgorot: data.budgetAgorot ? Math.max(0, data.budgetAgorot) : null,
        directWorkerId: data.mode === ProcurementMode.DIRECT ? data.directWorkerId : null,
        openedAt: new Date(),
      },
    });

    // Create invitations if invited mode
    if (data.mode === ProcurementMode.INVITED && data.invitedWorkerIds) {
      await tx.tenderInvitation.createMany({
        data: data.invitedWorkerIds.map((workerId) => ({
          procurementId: procurement.id,
          workerId,
          response: InvitationResponse.PENDING,
        })),
      });

      // Notify invited workers
      for (const workerId of data.invitedWorkerIds) {
        await createNotification(
          {
            recipientId: workerId,
            eventType: "TENDER_INVITATION",
            resourceType: "Procurement",
            resourceId: procurement.id,
            messageKey: "notifications.tender_invitation",
            messageParams: { title: request.title },
          },
          tx
        );
      }
    }

    // Notify direct worker
    if (data.mode === ProcurementMode.DIRECT && data.directWorkerId) {
      await createNotification(
        {
          recipientId: data.directWorkerId,
          eventType: "DIRECT_QUOTE_REQUESTED",
          resourceType: "Procurement",
          resourceId: procurement.id,
          messageKey: "notifications.direct_quote_requested",
          messageParams: { title: request.title },
        },
        tx
      );
    }

    // Attach shared images if specified
    if (data.sharedAttachmentIds && data.sharedAttachmentIds.length > 0) {
      await tx.procurementImage.createMany({
        data: data.sharedAttachmentIds.map((attachmentId) => ({
          procurementId: procurement.id,
          attachmentId,
          sharedWithWorkers: true,
        })),
      });
    }

    await createAuditEvent(
      {
        actorId: user.id,
        action: "PROCUREMENT_OPENED",
        entityType: "Procurement",
        entityId: procurement.id,
        requestId,
        newState: procurement,
      },
      tx
    );

    return procurement;
  });
}

// ─── Worker Offer Submissions ────────────────────────────────────────────────

export async function submitOrReviseOffer(
  user: AuthUser,
  procurementId: string,
  data: {
    amountAgorot: number;
    scopeText?: string;
    inclusions?: string;
    assumptions?: string;
    proposedDate?: Date | string;
    estimatedDays?: number;
    validUntil?: Date | string;
  }
) {
  assertWorker(user);

  if (data.amountAgorot <= 0) {
    throw new Error("AMOUNT_MUST_BE_POSITIVE");
  }

  return prisma.$transaction(async (tx) => {
    // Lock procurement
    const procurement = await tx.procurement.findUnique({
      where: { id: procurementId },
      include: {
        request: { include: { category: true, unit: { include: { building: true } } } },
        invitations: true,
      },
    });

    if (!procurement || procurement.status !== ProcurementStatus.OPEN) {
      throw new Error("PROCUREMENT_NOT_OPEN");
    }

    // Check submission deadline using server time
    if (procurement.deadline && new Date() > procurement.deadline) {
      throw new Error("SUBMISSION_DEADLINE_PASSED");
    }

    // Verify worker is approved
    const profile = await tx.workerProfile.findUnique({
      where: { userId: user.id },
      include: { categories: true, areas: true },
    });

    if (!profile || profile.status !== WorkerStatus.APPROVED) {
      throw new Error("WORKER_NOT_APPROVED");
    }

    // Verify category match
    const hasCategory = profile.categories.some((c) => c.categoryId === procurement.request.categoryId);
    if (!hasCategory) {
      throw new Error("WORKER_CATEGORY_MISMATCH");
    }

    // Mode-specific eligibility check:
    if (procurement.mode === ProcurementMode.DIRECT) {
      if (procurement.directWorkerId !== user.id) {
        throw new AuthorizationError("NOT_INVITED_TO_DIRECT_REQUEST");
      }
    } else if (procurement.mode === ProcurementMode.INVITED) {
      const isInvited = procurement.invitations.some((inv) => inv.workerId === user.id);
      if (!isInvited) {
        throw new AuthorizationError("NOT_INVITED_TO_TENDER");
      }
    }

    // Check existing offer for this round
    const existingOffer = await tx.offer.findUnique({
      where: {
        procurementId_workerId: {
          procurementId,
          workerId: user.id,
        },
      },
    });

    let offer;
    if (existingOffer) {
      if (existingOffer.status === OfferStatus.ACCEPTED) {
        throw new Error("OFFER_ALREADY_ACCEPTED");
      }

      // Increment version for revisions
      offer = await tx.offer.update({
        where: { id: existingOffer.id },
        data: {
          version: existingOffer.version + 1,
          amountAgorot: data.amountAgorot,
          scopeText: data.scopeText || null,
          inclusions: data.inclusions || null,
          assumptions: data.assumptions || null,
          proposedDate: data.proposedDate ? new Date(data.proposedDate) : null,
          estimatedDays: data.estimatedDays || null,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          status: OfferStatus.SUBMITTED,
        },
      });

      await createAuditEvent(
        {
          actorId: user.id,
          action: "OFFER_REVISED",
          entityType: "Offer",
          entityId: offer.id,
          requestId: procurement.requestId,
          previousState: existingOffer,
          newState: offer,
        },
        tx
      );
    } else {
      offer = await tx.offer.create({
        data: {
          procurementId,
          workerId: user.id,
          amountAgorot: data.amountAgorot,
          scopeText: data.scopeText || null,
          inclusions: data.inclusions || null,
          assumptions: data.assumptions || null,
          proposedDate: data.proposedDate ? new Date(data.proposedDate) : null,
          estimatedDays: data.estimatedDays || null,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          status: OfferStatus.SUBMITTED,
        },
      });

      // Update tender invitation status if invited
      await tx.tenderInvitation.updateMany({
        where: { procurementId, workerId: user.id },
        data: { response: InvitationResponse.OFFERED },
      });

      // Notify owner of new offer
      await createNotification(
        {
          recipientId: procurement.request.unit.building.ownerId,
          eventType: "OFFER_SUBMITTED",
          resourceType: "Offer",
          resourceId: offer.id,
          messageKey: "notifications.offer_received",
          messageParams: { workerName: user.name, title: procurement.request.title },
        },
        tx
      );

      await createAuditEvent(
        {
          actorId: user.id,
          action: "OFFER_SUBMITTED",
          entityType: "Offer",
          entityId: offer.id,
          requestId: procurement.requestId,
          newState: offer,
        },
        tx
      );
    }

    return offer;
  });
}

// ─── Atomic Award ────────────────────────────────────────────────────────────

export async function acceptOfferAndAward(
  user: AuthUser,
  offerId: string,
  expectedOfferVersion: number
) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    // 1. Fetch offer and related records
    const offer = await tx.offer.findUnique({
      where: { id: offerId },
      include: {
        procurement: {
          include: {
            request: {
              include: {
                unit: { include: { building: true } },
                workOrder: true,
              },
            },
          },
        },
        worker: {
          include: { workerProfile: true },
        },
      },
    });

    if (!offer) throw new Error("OFFER_NOT_FOUND");

    const procurement = offer.procurement;
    const request = procurement.request;
    const building = request.unit.building;

    // Authorization
    if (building.ownerId !== user.id && user.role !== "SUPER_ADMIN") {
      throw new AuthorizationError("FORBIDDEN");
    }

    // 2. Validate states and offer version
    if (offer.version !== expectedOfferVersion) {
      throw new Error("OFFER_VERSION_MISMATCH_STALE_TERMS");
    }

    if (offer.status !== OfferStatus.SUBMITTED) {
      throw new Error("OFFER_NOT_ELIGIBLE_FOR_ACCEPTANCE");
    }

    if (offer.validUntil && new Date() > offer.validUntil) {
      throw new Error("OFFER_VALIDITY_EXPIRED");
    }

    if (procurement.status !== ProcurementStatus.OPEN) {
      throw new Error("PROCUREMENT_ROUND_NOT_OPEN");
    }

    if (request.status !== RequestStatus.PROCUREMENT) {
      throw new Error("REQUEST_NOT_IN_PROCUREMENT");
    }

    if (request.workOrder) {
      throw new Error("WORK_ORDER_ALREADY_EXISTS");
    }

    // Verify worker is still approved
    if (offer.worker.workerProfile?.status !== WorkerStatus.APPROVED) {
      throw new Error("WORKER_IS_NO_LONGER_APPROVED");
    }

    // 3. Create immutable WorkOrder snapshot
    const workOrder = await tx.workOrder.create({
      data: {
        requestId: request.id,
        offerId: offer.id,
        workerId: offer.workerId,
        agreedAmountAgorot: offer.amountAgorot,
        agreedCurrency: offer.currency,
        agreedScope: offer.scopeText,
        agreedSchedule: offer.proposedDate ? offer.proposedDate.toISOString() : null,
        agreedDuration: offer.estimatedDays,
        offerVersion: offer.version,
        locationSnapshot: `${building.nameEn} - Unit ${request.unit.label}, ${building.address}`,
        assignedAt: new Date(),
      },
    });

    // 4. Update request status to ASSIGNED
    await tx.maintenanceRequest.update({
      where: { id: request.id },
      data: { status: RequestStatus.ASSIGNED },
    });

    // 5. Update procurement to AWARDED
    await tx.procurement.update({
      where: { id: procurement.id },
      data: {
        status: ProcurementStatus.AWARDED,
        awardedAt: new Date(),
      },
    });

    // 6. Update winning offer to ACCEPTED
    await tx.offer.update({
      where: { id: offer.id },
      data: { status: OfferStatus.ACCEPTED },
    });

    // 7. Mark remaining submitted offers NOT_SELECTED
    await tx.offer.updateMany({
      where: {
        procurementId: procurement.id,
        id: { not: offer.id },
        status: OfferStatus.SUBMITTED,
      },
      data: { status: OfferStatus.NOT_SELECTED },
    });

    // 8. Notify winner
    await createNotification(
      {
        recipientId: offer.workerId,
        eventType: "OFFER_AWARDED",
        resourceType: "WorkOrder",
        resourceId: workOrder.id,
        messageKey: "notifications.offer_awarded",
        messageParams: { title: request.title, location: workOrder.locationSnapshot || "" },
      },
      tx
    );

    // 9. Notify non-winning bidders (without disclosing winner's price)
    const otherOffers = await tx.offer.findMany({
      where: {
        procurementId: procurement.id,
        id: { not: offer.id },
      },
      select: { workerId: true },
    });

    for (const other of otherOffers) {
      await createNotification(
        {
          recipientId: other.workerId,
          eventType: "TENDER_CLOSED_NOT_SELECTED",
          resourceType: "Procurement",
          resourceId: procurement.id,
          messageKey: "notifications.offer_not_selected",
          messageParams: { title: request.title },
        },
        tx
      );
    }

    await createAuditEvent(
      {
        actorId: user.id,
        action: "OFFER_AWARDED",
        entityType: "WorkOrder",
        entityId: workOrder.id,
        requestId: request.id,
        newState: workOrder,
      },
      tx
    );

    return workOrder;
  });
}

// ─── Close Procurement Round Without Award ───────────────────────────────────

export async function closeProcurementWithoutAward(
  user: AuthUser,
  procurementId: string,
  reason?: string
) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const procurement = await tx.procurement.findUnique({
      where: { id: procurementId },
      include: {
        request: { include: { unit: { include: { building: true } } } },
      },
    });

    if (!procurement) throw new Error("NOT_FOUND");
    if (procurement.request.unit.building.ownerId !== user.id && user.role !== "SUPER_ADMIN") {
      throw new AuthorizationError("FORBIDDEN");
    }

    if (procurement.status !== ProcurementStatus.OPEN) {
      throw new Error("PROCUREMENT_NOT_OPEN");
    }

    const updated = await tx.procurement.update({
      where: { id: procurementId },
      data: {
        status: ProcurementStatus.CLOSED_NO_AWARD,
        closedAt: new Date(),
      },
    });

    // Mark submitted offers as NOT_SELECTED
    await tx.offer.updateMany({
      where: { procurementId, status: OfferStatus.SUBMITTED },
      data: { status: OfferStatus.NOT_SELECTED },
    });

    await createAuditEvent(
      {
        actorId: user.id,
        action: "PROCUREMENT_CLOSED_NO_AWARD",
        entityType: "Procurement",
        entityId: procurementId,
        requestId: procurement.requestId,
        reason: reason || null,
      },
      tx
    );

    return updated;
  });
}
