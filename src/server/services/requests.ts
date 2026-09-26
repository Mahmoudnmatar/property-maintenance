import { prisma } from "@/server/db";
import { AuthUser, assertAuthenticated, AuthorizationError } from "@/server/policies";
import { RequestStatus, Urgency, Audience, Role } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

export async function createMaintenanceRequest(
  user: AuthUser,
  data: {
    unitId: string;
    categoryId: string;
    title: string;
    description: string;
    urgency?: Urgency;
    desiredDate?: Date | string;
    attachmentIds?: string[];
  }
) {
  assertAuthenticated(user);

  return prisma.$transaction(async (tx) => {
    // Verify unit and active tenancy
    const unit = await tx.unit.findUnique({
      where: { id: data.unitId },
      include: {
        building: true,
        tenancies: {
          where: { endedAt: null },
          include: { tenant: true },
        },
      },
    });

    if (!unit || unit.archivedAt) {
      throw new Error("UNIT_NOT_FOUND");
    }

    const activeTenancy = unit.tenancies[0];
    if (!activeTenancy) {
      throw new Error("UNIT_HAS_NO_ACTIVE_TENANCY");
    }

    // Authorization: User must be either the active tenant or the building owner
    const isTenant = user.id === activeTenancy.tenantId;
    const isOwner = user.id === unit.building.ownerId || user.role === Role.SUPER_ADMIN;

    if (!isTenant && !isOwner) {
      throw new AuthorizationError("FORBIDDEN");
    }

    // Verify category exists and is active
    const category = await tx.serviceCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!category || !category.isActive) {
      throw new Error("INVALID_CATEGORY");
    }

    const request = await tx.maintenanceRequest.create({
      data: {
        unitId: unit.id,
        tenancyId: activeTenancy.id,
        namedTenantId: activeTenancy.tenantId,
        createdById: user.id,
        categoryId: category.id,
        title: data.title.trim(),
        description: data.description.trim(),
        urgency: data.urgency || Urgency.NORMAL,
        desiredDate: data.desiredDate ? new Date(data.desiredDate) : null,
        status: RequestStatus.SUBMITTED,
      },
      include: {
        unit: { include: { building: true } },
        category: true,
        namedTenant: { select: { id: true, name: true, email: true } },
      },
    });

    // Attach initial photos if provided
    if (data.attachmentIds && data.attachmentIds.length > 0) {
      await tx.requestAttachment.createMany({
        data: data.attachmentIds.map((attachmentId) => ({
          requestId: request.id,
          attachmentId,
        })),
      });
    }

    // Notify the other party (if tenant created -> notify owner; if owner created -> notify tenant)
    const recipientId = isTenant ? unit.building.ownerId : activeTenancy.tenantId;
    await createNotification(
      {
        recipientId,
        eventType: "MAINTENANCE_REQUEST_CREATED",
        resourceType: "MaintenanceRequest",
        resourceId: request.id,
        messageKey: "notifications.request_created",
        messageParams: { title: request.title, unitLabel: unit.label },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "REQUEST_CREATED",
        entityType: "MaintenanceRequest",
        entityId: request.id,
        requestId: request.id,
        newState: request,
      },
      tx
    );

    return request;
  });
}

export async function acceptRequestForProcurement(user: AuthUser, requestId: string) {
  assertAuthenticated(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { unit: { include: { building: true } } },
    });

    if (!request || (request.unit.building.ownerId !== user.id && user.role !== Role.SUPER_ADMIN)) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (request.status !== RequestStatus.SUBMITTED) {
      throw new Error("INVALID_STATE");
    }

    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.PROCUREMENT },
    });

    await createNotification(
      {
        recipientId: request.namedTenantId,
        eventType: "REQUEST_ACCEPTED_FOR_SOURCING",
        resourceType: "MaintenanceRequest",
        resourceId: requestId,
        messageKey: "notifications.request_in_procurement",
        messageParams: { title: request.title },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "REQUEST_INTO_PROCUREMENT",
        entityType: "MaintenanceRequest",
        entityId: requestId,
        requestId,
        previousState: { status: RequestStatus.SUBMITTED },
        newState: { status: RequestStatus.PROCUREMENT },
      },
      tx
    );

    return updated;
  });
}

export async function rejectRequest(user: AuthUser, requestId: string, reason: string) {
  assertAuthenticated(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { unit: { include: { building: true } } },
    });

    if (!request || (request.unit.building.ownerId !== user.id && user.role !== Role.SUPER_ADMIN)) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (request.status !== RequestStatus.SUBMITTED) {
      throw new Error("INVALID_STATE");
    }

    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.REJECTED,
        rejectReason: reason,
      },
    });

    await createNotification(
      {
        recipientId: request.namedTenantId,
        eventType: "REQUEST_REJECTED",
        resourceType: "MaintenanceRequest",
        resourceId: requestId,
        messageKey: "notifications.request_rejected",
        messageParams: { title: request.title, reason },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "REQUEST_REJECTED",
        entityType: "MaintenanceRequest",
        entityId: requestId,
        requestId,
        reason,
        previousState: { status: RequestStatus.SUBMITTED },
        newState: { status: RequestStatus.REJECTED },
      },
      tx
    );

    return updated;
  });
}

export async function cancelRequest(user: AuthUser, requestId: string, reason: string) {
  assertAuthenticated(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: { include: { building: true } },
        workOrder: true,
      },
    });

    if (!request) throw new AuthorizationError("NOT_FOUND");

    const isTenant = request.namedTenantId === user.id;
    const isOwner = request.unit.building.ownerId === user.id;
    const isAdmin = user.role === Role.SUPER_ADMIN;

    if (!isTenant && !isOwner && !isAdmin) {
      throw new AuthorizationError("FORBIDDEN");
    }

    // Cancellation restrictions per Section 5.3:
    // If work started, awaiting confirmation, or tenant-confirmed: only Super Admin can exceptionally cancel
    const workStarted =
      request.status === RequestStatus.IN_PROGRESS ||
      request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION ||
      request.status === RequestStatus.TENANT_CONFIRMED;

    if (workStarted && !isAdmin) {
      throw new Error("WORK_ALREADY_STARTED_ONLY_ADMIN_CAN_CANCEL");
    }

    if (request.status === RequestStatus.CLOSED) {
      throw new Error("CANNOT_CANCEL_CLOSED_REQUEST");
    }

    // Close open procurements atomically
    await tx.procurement.updateMany({
      where: {
        requestId,
        status: { in: ["DRAFT", "OPEN"] },
      },
      data: { status: "CANCELLED" },
    });

    // If work order exists, update cancellation
    if (request.workOrder) {
      await tx.workOrder.update({
        where: { id: request.workOrder.id },
        data: {
          cancelledAt: new Date(),
          cancelledById: user.id,
        },
      });
    }

    const updated = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        status: RequestStatus.CANCELLED,
        cancelReason: reason,
      },
    });

    // Notify appropriate participants
    const notifyIds = new Set<string>();
    if (request.namedTenantId !== user.id) notifyIds.add(request.namedTenantId);
    if (request.unit.building.ownerId !== user.id) notifyIds.add(request.unit.building.ownerId);
    if (request.workOrder) notifyIds.add(request.workOrder.workerId);

    for (const recipientId of notifyIds) {
      await createNotification(
        {
          recipientId,
          eventType: "REQUEST_CANCELLED",
          resourceType: "MaintenanceRequest",
          resourceId: requestId,
          messageKey: "notifications.request_cancelled",
          messageParams: { title: request.title, reason },
        },
        tx
      );
    }

    await createAuditEvent(
      {
        actorId: user.id,
        action: "REQUEST_CANCELLED",
        entityType: "MaintenanceRequest",
        entityId: requestId,
        requestId,
        reason,
        previousState: { status: request.status },
        newState: { status: RequestStatus.CANCELLED },
      },
      tx
    );

    return updated;
  });
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addComment(
  user: AuthUser,
  requestId: string,
  data: { content: string; audience: Audience; attachmentIds?: string[] }
) {
  assertAuthenticated(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: { include: { building: true } },
        workOrder: true,
      },
    });

    if (!request) throw new AuthorizationError("NOT_FOUND");

    const isTenant = request.namedTenantId === user.id;
    const isOwner = request.unit.building.ownerId === user.id;
    const isWorker = request.workOrder?.workerId === user.id;
    const isAdmin = user.role === Role.SUPER_ADMIN;

    // Audience permissions per Section 5.7:
    // TENANT_OWNER is restricted to tenant, owner, admin. Workers cannot post or see TENANT_OWNER comments!
    if (data.audience === Audience.TENANT_OWNER) {
      if (isWorker && !isOwner && !isAdmin) {
        throw new AuthorizationError("WORKERS_CANNOT_USE_TENANT_OWNER_AUDIENCE");
      }
      if (!isTenant && !isOwner && !isAdmin) {
        throw new AuthorizationError("FORBIDDEN");
      }
    } else if (data.audience === Audience.JOB_PARTICIPANTS) {
      // Available after award to assigned worker as well
      if (!isTenant && !isOwner && !isWorker && !isAdmin) {
        throw new AuthorizationError("FORBIDDEN");
      }
    }

    const comment = await tx.comment.create({
      data: {
        requestId,
        authorId: user.id,
        audience: data.audience,
        content: data.content.trim(),
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    if (data.attachmentIds && data.attachmentIds.length > 0) {
      await tx.commentAttachment.createMany({
        data: data.attachmentIds.map((attachmentId) => ({
          commentId: comment.id,
          attachmentId,
        })),
      });
    }

    return comment;
  });
}

export async function getRequestDetails(user: AuthUser, requestId: string) {
  assertAuthenticated(user);

  const request = await prisma.maintenanceRequest.findUnique({
    where: { id: requestId },
    include: {
      unit: { include: { building: true } },
      category: true,
      namedTenant: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      attachments: { include: { attachment: true } },
      workOrder: {
        include: {
          worker: { select: { id: true, name: true } },
          paymentRecord: true,
          feedback: true,
          completionAttachments: { include: { attachment: true } },
        },
      },
      comments: {
        where: { hiddenAt: null },
        include: {
          author: { select: { id: true, name: true, role: true } },
          attachments: { include: { attachment: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      procurements: {
        orderBy: { roundNumber: "desc" },
        include: {
          offers: {
            include: { worker: { select: { id: true, name: true } } },
          },
          invitations: true,
        },
      },
    },
  });

  if (!request) throw new AuthorizationError("NOT_FOUND");

  const isTenant = request.namedTenantId === user.id;
  const isOwner = request.unit.building.ownerId === user.id;
  const isWorker = request.workOrder?.workerId === user.id;
  const isAdmin = user.role === Role.SUPER_ADMIN;

  // Authorization check
  if (!isTenant && !isOwner && !isWorker && !isAdmin) {
    throw new AuthorizationError("NOT_FOUND");
  }

  // Filter fields based on role:
  // Tenant cannot see competing offers, other workers' quotes, or payment records
  if (isTenant && !isOwner && !isAdmin) {
    return {
      ...request,
      procurements: [], // Hidden from tenant
      workOrder: request.workOrder
        ? {
            id: request.workOrder.id,
            worker: request.workOrder.worker,
            assignedAt: request.workOrder.assignedAt,
            startedAt: request.workOrder.startedAt,
            completedAt: request.workOrder.completedAt,
            confirmedAt: request.workOrder.confirmedAt,
            closedAt: request.workOrder.closedAt,
            completionNotes: request.workOrder.completionNotes,
            completionAttachments: request.workOrder.completionAttachments,
            feedback: request.workOrder.feedback,
            // Exclude paymentRecord and agreedAmountAgorot from tenant
          }
        : null,
      comments: request.comments.filter(
        (c) => c.audience === Audience.TENANT_OWNER || c.audience === Audience.JOB_PARTICIPANTS
      ),
    };
  }

  // Assigned Worker cannot see pre-award private tenant comments or competing offers
  if (isWorker && !isOwner && !isAdmin) {
    return {
      ...request,
      comments: request.comments.filter((c) => c.audience === Audience.JOB_PARTICIPANTS),
      procurements: [], // Competitor offers hidden
    };
  }

  return request;
}
