import { prisma } from "@/server/db";
import { AuthUser, assertWorker, assertSuperAdmin, assertOwner, assertAuthenticated, AuthorizationError } from "@/server/policies";
import { WorkerStatus, EvidenceKind, Prisma } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

// ─── Categories & Areas (Admin managed) ──────────────────────────────────────

export async function createServiceCategory(
  user: AuthUser,
  data: { code: string; nameEn: string; nameAr: string; displayOrder?: number }
) {
  assertSuperAdmin(user);

  return prisma.serviceCategory.create({
    data: {
      code: data.code.trim().toUpperCase(),
      nameEn: data.nameEn.trim(),
      nameAr: data.nameAr.trim(),
      displayOrder: data.displayOrder || 0,
    },
  });
}

export async function toggleServiceCategory(user: AuthUser, id: string, isActive: boolean) {
  assertSuperAdmin(user);

  return prisma.serviceCategory.update({
    where: { id },
    data: { isActive },
  });
}

export async function getActiveCategories() {
  return prisma.serviceCategory.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
  });
}

export async function getAllCategories(user: AuthUser) {
  assertSuperAdmin(user);
  return prisma.serviceCategory.findMany({
    orderBy: { displayOrder: "asc" },
  });
}

export async function createServiceArea(
  user: AuthUser,
  data: { code: string; nameEn: string; nameAr: string }
) {
  assertSuperAdmin(user);

  return prisma.serviceArea.create({
    data: {
      code: data.code.trim().toUpperCase(),
      nameEn: data.nameEn.trim(),
      nameAr: data.nameAr.trim(),
    },
  });
}

export async function getActiveAreas() {
  return prisma.serviceArea.findMany({
    where: { isActive: true },
    orderBy: { nameEn: "asc" },
  });
}

// ─── Worker Profile Management ───────────────────────────────────────────────

export async function getOrCreateWorkerProfile(user: AuthUser) {
  assertWorker(user);

  let profile = await prisma.workerProfile.findUnique({
    where: { userId: user.id },
    include: {
      categories: { include: { category: true } },
      areas: { include: { area: true } },
      evidences: { include: { attachment: true } },
      evaluations: { include: { admin: { select: { name: true } } } },
      submissions: { orderBy: { revision: "desc" }, take: 1 },
    },
  });

  if (!profile) {
    profile = await prisma.workerProfile.create({
      data: {
        userId: user.id,
        status: WorkerStatus.DRAFT,
      },
      include: {
        categories: { include: { category: true } },
        areas: { include: { area: true } },
        evidences: { include: { attachment: true } },
        evaluations: { include: { admin: { select: { name: true } } } },
        submissions: { orderBy: { revision: "desc" }, take: 1 },
      },
    });
  }

  return profile;
}

export async function updateWorkerDraft(
  user: AuthUser,
  data: {
    bio?: string;
    categories: { categoryId: string; experienceYears: number }[];
    areaIds: string[];
  }
) {
  assertWorker(user);

  return prisma.$transaction(async (tx) => {
    let profile = await tx.workerProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      profile = await tx.workerProfile.create({
        data: { userId: user.id, status: WorkerStatus.DRAFT },
      });
    }

    if (profile.status === WorkerStatus.PENDING_REVIEW) {
      throw new Error("CANNOT_EDIT_WHILE_UNDER_REVIEW");
    }

    // Update bio
    await tx.workerProfile.update({
      where: { id: profile.id },
      data: { bio: data.bio || null },
    });

    // Replace categories
    await tx.workerCategory.deleteMany({ where: { workerProfileId: profile.id } });
    if (data.categories.length > 0) {
      await tx.workerCategory.createMany({
        data: data.categories.map((c) => ({
          workerProfileId: profile.id,
          categoryId: c.categoryId,
          experienceYears: Math.max(0, c.experienceYears),
        })),
      });
    }

    // Replace areas
    await tx.workerServiceArea.deleteMany({ where: { workerProfileId: profile.id } });
    if (data.areaIds.length > 0) {
      await tx.workerServiceArea.createMany({
        data: data.areaIds.map((areaId) => ({
          workerProfileId: profile.id,
          areaId,
        })),
      });
    }

    return tx.workerProfile.findUnique({
      where: { id: profile.id },
      include: {
        categories: { include: { category: true } },
        areas: { include: { area: true } },
        evidences: { include: { attachment: true } },
      },
    });
  });
}

export async function submitWorkerApplication(user: AuthUser) {
  assertWorker(user);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.workerProfile.findUnique({
      where: { userId: user.id },
      include: {
        categories: true,
        areas: true,
        evidences: true,
      },
    });

    if (!profile) throw new Error("PROFILE_NOT_FOUND");
    if (profile.status === WorkerStatus.PENDING_REVIEW) {
      throw new Error("ALREADY_SUBMITTED");
    }

    // Validation: at least one active category
    if (profile.categories.length === 0) {
      throw new Error("CATEGORY_REQUIRED");
    }

    // Validation: at least one service area
    if (profile.areas.length === 0) {
      throw new Error("AREA_REQUIRED");
    }

    // Validation: evidence minimums (at least one portfolio example, at least one certificate/experience proof)
    const portfolioCount = profile.evidences.filter((e) => e.kind === EvidenceKind.PORTFOLIO).length;
    const certCount = profile.evidences.filter((e) => e.kind === EvidenceKind.CERTIFICATE).length;

    if (portfolioCount < 1 || certCount < 1) {
      throw new Error("EVIDENCE_MINIMUM_REQUIRED");
    }

    const nextRevision = profile.currentRevision + 1;

    // Create immutable submission snapshot
    const snapshot = {
      bio: profile.bio,
      categories: profile.categories,
      areas: profile.areas,
      evidences: profile.evidences.map((e) => ({
        id: e.id,
        kind: e.kind,
        caption: e.caption,
        attachmentId: e.attachmentId,
      })),
      submittedAt: new Date().toISOString(),
    };

    await tx.workerSubmission.create({
      data: {
        workerProfileId: profile.id,
        revision: nextRevision,
        snapshot,
        status: WorkerStatus.PENDING_REVIEW,
      },
    });

    const updatedProfile = await tx.workerProfile.update({
      where: { id: profile.id },
      data: {
        status: WorkerStatus.PENDING_REVIEW,
        currentRevision: nextRevision,
        submittedRevision: nextRevision,
        submittedAt: new Date(),
        decisionReason: null,
      },
    });

    await createAuditEvent(
      {
        actorId: user.id,
        action: "WORKER_APPLICATION_SUBMITTED",
        entityType: "WorkerProfile",
        entityId: profile.id,
        newState: { revision: nextRevision, status: WorkerStatus.PENDING_REVIEW },
      },
      tx
    );

    return updatedProfile;
  });
}

// ─── Admin Worker Review & Assessment ────────────────────────────────────────

export async function getPendingWorkerApplications(user: AuthUser) {
  assertSuperAdmin(user);

  return prisma.workerProfile.findMany({
    where: { status: WorkerStatus.PENDING_REVIEW },
    include: {
      user: { select: { id: true, name: true, email: true } },
      categories: { include: { category: true } },
      areas: { include: { area: true } },
      evidences: { include: { attachment: true } },
      submissions: { orderBy: { revision: "desc" }, take: 1 },
    },
    orderBy: { submittedAt: "asc" },
  });
}

export async function getWorkerApplicationDetails(user: AuthUser, profileId: string) {
  const profile = await prisma.workerProfile.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      categories: { include: { category: true } },
      areas: { include: { area: true } },
      evidences: { include: { attachment: true } },
      evaluations: { include: { admin: { select: { name: true } } } },
      submissions: { orderBy: { revision: "desc" } },
    },
  });

  if (!profile) throw new Error("NOT_FOUND");

  // Non-admins can only see their own profile or public approved profiles
  if (user.role !== "SUPER_ADMIN" && profile.userId !== user.id) {
    if (profile.status !== WorkerStatus.APPROVED) {
      throw new AuthorizationError("NOT_FOUND");
    }
  }

  return profile;
}

export async function evaluateAndDecideWorkerApplication(
  user: AuthUser,
  profileId: string,
  decision: "APPROVED" | "REJECTED" | "CHANGES_REQUESTED",
  evaluations: { categoryId: string; score: number; publicSummary: string; privateNotes?: string }[],
  reason?: string
) {
  assertSuperAdmin(user);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.workerProfile.findUnique({
      where: { id: profileId },
      include: { categories: true },
    });

    if (!profile) throw new Error("NOT_FOUND");
    if (profile.status !== WorkerStatus.PENDING_REVIEW) {
      throw new Error("INVALID_STATE");
    }

    const currentRev = profile.submittedRevision || profile.currentRevision;

    // If approving, evaluate all selected categories
    if (decision === "APPROVED") {
      for (const cat of profile.categories) {
        const ev = evaluations.find((e) => e.categoryId === cat.categoryId);
        if (!ev || ev.score < 1 || ev.score > 5) {
          throw new Error(`MISSING_EVALUATION_FOR_CATEGORY_${cat.categoryId}`);
        }

        await tx.adminEvaluation.upsert({
          where: {
            workerProfileId_profileRevision_categoryId: {
              workerProfileId: profile.id,
              profileRevision: currentRev,
              categoryId: cat.categoryId,
            },
          },
          create: {
            workerProfileId: profile.id,
            profileRevision: currentRev,
            categoryId: cat.categoryId,
            adminId: user.id,
            score: ev.score,
            publicSummary: ev.publicSummary.trim(),
            privateNotes: ev.privateNotes?.trim() || null,
          },
          update: {
            score: ev.score,
            publicSummary: ev.publicSummary.trim(),
            privateNotes: ev.privateNotes?.trim() || null,
          },
        });
      }
    }

    const newStatus =
      decision === "APPROVED"
        ? WorkerStatus.APPROVED
        : decision === "REJECTED"
        ? WorkerStatus.REJECTED
        : WorkerStatus.CHANGES_REQUESTED;

    // Update the submission row, including seeded or legacy profiles without one.
    await tx.workerSubmission.upsert({
      where: {
        workerProfileId_revision: {
          workerProfileId: profile.id,
          revision: currentRev,
        },
      },
      create: {
        workerProfileId: profile.id,
        revision: currentRev,
        snapshot: {},
        status: newStatus,
        reviewResult: newStatus,
        reviewReason: reason || null,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      update: {
        status: newStatus,
        reviewResult: newStatus,
        reviewReason: reason || null,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
    });

    const updatedProfile = await tx.workerProfile.update({
      where: { id: profile.id },
      data: {
        status: newStatus,
        approvedRevision: decision === "APPROVED" ? currentRev : profile.approvedRevision,
        decidedAt: new Date(),
        decisionReason: reason || null,
        reviewedById: user.id,
      },
    });

    // Notify worker
    await createNotification(
      {
        recipientId: profile.userId,
        eventType: `WORKER_APPLICATION_${decision}`,
        resourceType: "WorkerProfile",
        resourceId: profile.id,
        messageKey: `notifications.worker_${decision.toLowerCase()}`,
        messageParams: { reason: reason || "" },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: `WORKER_APPLICATION_${decision}`,
        entityType: "WorkerProfile",
        entityId: profile.id,
        previousState: { status: profile.status },
        newState: { status: newStatus, reason },
      },
      tx
    );

    return updatedProfile;
  });
}

export async function suspendWorker(user: AuthUser, profileId: string, reason: string) {
  assertSuperAdmin(user);

  return prisma.$transaction(async (tx) => {
    const profile = await tx.workerProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) throw new Error("NOT_FOUND");

    const updated = await tx.workerProfile.update({
      where: { id: profileId },
      data: {
        status: WorkerStatus.SUSPENDED,
        decisionReason: reason,
      },
    });

    await createNotification(
      {
        recipientId: profile.userId,
        eventType: "WORKER_SUSPENDED",
        resourceType: "WorkerProfile",
        resourceId: profile.id,
        messageKey: "notifications.worker_suspended",
        messageParams: { reason },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "WORKER_SUSPENDED",
        entityType: "WorkerProfile",
        entityId: profileId,
        reason,
      },
      tx
    );

    return updated;
  });
}

// ─── Owner Worker Catalogue ──────────────────────────────────────────────────

export async function searchApprovedWorkers(
  user: AuthUser,
  filters?: { categoryId?: string; areaId?: string }
) {
  assertOwner(user);

  return prisma.workerProfile.findMany({
    where: {
      status: WorkerStatus.APPROVED,
      categories: filters?.categoryId ? { some: { categoryId: filters.categoryId } } : undefined,
      areas: filters?.areaId ? { some: { areaId: filters.areaId } } : undefined,
    },
    include: {
      user: { select: { id: true, name: true } },
      categories: { include: { category: true } },
      areas: { include: { area: true } },
      evaluations: {
        where: {
          // Latest approved evaluations
        },
        include: { admin: { select: { name: true } } },
      },
      evidences: {
        where: { kind: EvidenceKind.PORTFOLIO, adminApproved: true, publishConsent: true },
        include: { attachment: true },
      },
    },
  });
}
