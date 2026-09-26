import { prisma } from "@/server/db";
import { AuthUser, assertOwner, assertTenant, assertAuthenticated, AuthorizationError } from "@/server/policies";
import { MembershipStatus, UnitType } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";
import crypto from "crypto";

export function generateJoinCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. "A1B2C3D4"
}

// ─── Buildings ───────────────────────────────────────────────────────────────

export async function createBuilding(
  user: AuthUser,
  data: { nameEn: string; nameAr?: string; address: string; areaId?: string }
) {
  assertOwner(user);

  let joinCode = generateJoinCode();
  // Ensure unique join code
  while (await prisma.building.findUnique({ where: { joinCode } })) {
    joinCode = generateJoinCode();
  }

  const building = await prisma.building.create({
    data: {
      ownerId: user.id,
      nameEn: data.nameEn,
      nameAr: data.nameAr || null,
      address: data.address,
      areaId: data.areaId || null,
      joinCode,
    },
  });

  await createAuditEvent({
    actorId: user.id,
    action: "BUILDING_CREATED",
    entityType: "Building",
    entityId: building.id,
    newState: building,
  });

  return building;
}

export async function rotateBuildingJoinCode(user: AuthUser, buildingId: string) {
  assertOwner(user);

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
  });

  if (!building || (building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
    throw new AuthorizationError("NOT_FOUND");
  }

  let newJoinCode = generateJoinCode();
  while (await prisma.building.findUnique({ where: { joinCode: newJoinCode } })) {
    newJoinCode = generateJoinCode();
  }

  const updated = await prisma.building.update({
    where: { id: buildingId },
    data: { joinCode: newJoinCode },
  });

  await createAuditEvent({
    actorId: user.id,
    action: "BUILDING_JOIN_CODE_ROTATED",
    entityType: "Building",
    entityId: buildingId,
    previousState: { joinCode: building.joinCode },
    newState: { joinCode: newJoinCode },
  });

  return updated;
}

export async function getOwnerBuildings(user: AuthUser) {
  assertOwner(user);

  return prisma.building.findMany({
    where: {
      ownerId: user.role === "SUPER_ADMIN" ? undefined : user.id,
      archivedAt: null,
    },
    include: {
      units: {
        where: { archivedAt: null },
        include: {
          tenancies: {
            where: { endedAt: null },
            include: { tenant: { select: { id: true, name: true, email: true } } },
          },
          membershipRequests: {
            where: { status: MembershipStatus.PENDING },
            include: { tenant: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBuildingDetails(user: AuthUser, buildingId: string) {
  assertOwner(user);

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
    include: {
      units: {
        where: { archivedAt: null },
        include: {
          tenancies: {
            where: { endedAt: null },
            include: { tenant: { select: { id: true, name: true, email: true } } },
          },
          membershipRequests: {
            where: { status: MembershipStatus.PENDING },
            include: { tenant: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { label: "asc" },
      },
    },
  });

  if (!building || (building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
    throw new AuthorizationError("NOT_FOUND");
  }

  return building;
}

// ─── Units ───────────────────────────────────────────────────────────────────

export async function createUnit(
  user: AuthUser,
  buildingId: string,
  data: { label: string; type?: UnitType; floor?: string }
) {
  assertOwner(user);

  const building = await prisma.building.findUnique({
    where: { id: buildingId },
  });

  if (!building || (building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
    throw new AuthorizationError("NOT_FOUND");
  }

  // Check unique label in building
  const existing = await prisma.unit.findUnique({
    where: {
      buildingId_label: {
        buildingId,
        label: data.label.trim(),
      },
    },
  });

  if (existing) {
    if (existing.archivedAt) {
      // Un-archive if previously archived
      return prisma.unit.update({
        where: { id: existing.id },
        data: { archivedAt: null, type: data.type || UnitType.APARTMENT, floor: data.floor || null },
      });
    }
    throw new Error("UNIT_LABEL_ALREADY_EXISTS");
  }

  const unit = await prisma.unit.create({
    data: {
      buildingId,
      label: data.label.trim(),
      type: data.type || UnitType.APARTMENT,
      floor: data.floor || null,
    },
  });

  await createAuditEvent({
    actorId: user.id,
    action: "UNIT_CREATED",
    entityType: "Unit",
    entityId: unit.id,
    newState: unit,
  });

  return unit;
}

// ─── Membership & Tenancy ────────────────────────────────────────────────────

export async function requestMembership(
  user: AuthUser,
  data: { joinCode: string; unitLabel: string }
) {
  assertTenant(user);

  // Check if tenant already has an active tenancy
  const activeTenancy = await prisma.tenancy.findFirst({
    where: {
      tenantId: user.id,
      endedAt: null,
    },
  });

  if (activeTenancy) {
    throw new Error("ALREADY_HAS_ACTIVE_TENANCY");
  }

  // Look up building by joinCode
  const building = await prisma.building.findUnique({
    where: { joinCode: data.joinCode.trim().toUpperCase() },
    include: {
      units: {
        where: {
          label: { equals: data.unitLabel.trim(), mode: "insensitive" },
          archivedAt: null,
        },
      },
    },
  });

  if (!building || building.archivedAt) {
    throw new Error("INVALID_JOIN_CODE");
  }

  const unit = building.units[0];
  if (!unit) {
    throw new Error("UNIT_NOT_FOUND");
  }

  // Check if there is already an active tenant in this unit
  const unitOccupied = await prisma.tenancy.findFirst({
    where: { unitId: unit.id, endedAt: null },
  });

  if (unitOccupied) {
    throw new Error("UNIT_ALREADY_OCCUPIED");
  }

  // Check if user already has a pending request for this unit
  const existingPending = await prisma.membershipRequest.findFirst({
    where: {
      tenantId: user.id,
      unitId: unit.id,
      status: MembershipStatus.PENDING,
    },
  });

  if (existingPending) {
    throw new Error("MEMBERSHIP_REQUEST_ALREADY_PENDING");
  }

  const request = await prisma.membershipRequest.create({
    data: {
      tenantId: user.id,
      unitId: unit.id,
      status: MembershipStatus.PENDING,
    },
    include: {
      unit: { include: { building: true } },
    },
  });

  // Notify owner
  await createNotification({
    recipientId: building.ownerId,
    eventType: "MEMBERSHIP_REQUEST_SUBMITTED",
    resourceType: "MembershipRequest",
    resourceId: request.id,
    messageKey: "notifications.membership_requested",
    messageParams: { tenantName: user.name, unitLabel: unit.label, buildingName: building.nameEn },
  });

  await createAuditEvent({
    actorId: user.id,
    action: "MEMBERSHIP_REQUESTED",
    entityType: "MembershipRequest",
    entityId: request.id,
    newState: request,
  });

  return request;
}

export async function approveMembership(user: AuthUser, requestId: string) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.membershipRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: {
          include: {
            building: true,
            tenancies: { where: { endedAt: null } },
          },
        },
        tenant: true,
      },
    });

    if (!request || (request.unit.building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (request.status !== MembershipStatus.PENDING) {
      throw new Error("INVALID_STATE");
    }

    // Check if unit already occupied
    if (request.unit.tenancies.length > 0) {
      throw new Error("UNIT_ALREADY_OCCUPIED");
    }

    // Check if tenant already has an active tenancy anywhere
    const tenantActiveTenancy = await tx.tenancy.findFirst({
      where: {
        tenantId: request.tenantId,
        endedAt: null,
      },
    });

    if (tenantActiveTenancy) {
      throw new Error("TENANT_ALREADY_HAS_ACTIVE_TENANCY");
    }

    // Update request
    const updatedRequest = await tx.membershipRequest.update({
      where: { id: requestId },
      data: {
        status: MembershipStatus.APPROVED,
        decidedById: user.id,
        decidedAt: new Date(),
      },
    });

    // Create Tenancy
    const tenancy = await tx.tenancy.create({
      data: {
        unitId: request.unitId,
        tenantId: request.tenantId,
        membershipRequestId: request.id,
        startedAt: new Date(),
      },
    });

    // Reject all other pending requests for this unit
    await tx.membershipRequest.updateMany({
      where: {
        unitId: request.unitId,
        status: MembershipStatus.PENDING,
        id: { not: requestId },
      },
      data: {
        status: MembershipStatus.REJECTED,
        decidedById: user.id,
        decidedAt: new Date(),
        reason: "Another tenant was approved for this unit",
      },
    });

    // Notify tenant
    await createNotification(
      {
        recipientId: request.tenantId,
        eventType: "MEMBERSHIP_APPROVED",
        resourceType: "Tenancy",
        resourceId: tenancy.id,
        messageKey: "notifications.membership_approved",
        messageParams: { unitLabel: request.unit.label, buildingName: request.unit.building.nameEn },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "MEMBERSHIP_APPROVED",
        entityType: "MembershipRequest",
        entityId: requestId,
        previousState: { status: MembershipStatus.PENDING },
        newState: { status: MembershipStatus.APPROVED, tenancyId: tenancy.id },
      },
      tx
    );

    return { request: updatedRequest, tenancy };
  });
}

export async function rejectMembership(user: AuthUser, requestId: string, reason?: string) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.membershipRequest.findUnique({
      where: { id: requestId },
      include: {
        unit: { include: { building: true } },
      },
    });

    if (!request || (request.unit.building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (request.status !== MembershipStatus.PENDING) {
      throw new Error("INVALID_STATE");
    }

    const updated = await tx.membershipRequest.update({
      where: { id: requestId },
      data: {
        status: MembershipStatus.REJECTED,
        decidedById: user.id,
        decidedAt: new Date(),
        reason: reason || null,
      },
    });

    await createNotification(
      {
        recipientId: request.tenantId,
        eventType: "MEMBERSHIP_REJECTED",
        resourceType: "MembershipRequest",
        resourceId: request.id,
        messageKey: "notifications.membership_rejected",
        messageParams: { unitLabel: request.unit.label, reason: reason || "" },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "MEMBERSHIP_REJECTED",
        entityType: "MembershipRequest",
        entityId: requestId,
        reason: reason || null,
      },
      tx
    );

    return updated;
  });
}

export async function endTenancy(user: AuthUser, tenancyId: string, reason: string) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const tenancy = await tx.tenancy.findUnique({
      where: { id: tenancyId },
      include: {
        unit: { include: { building: true } },
      },
    });

    if (!tenancy || (tenancy.unit.building.ownerId !== user.id && user.role !== "SUPER_ADMIN")) {
      throw new AuthorizationError("NOT_FOUND");
    }

    if (tenancy.endedAt) {
      throw new Error("TENANCY_ALREADY_ENDED");
    }

    const updated = await tx.tenancy.update({
      where: { id: tenancyId },
      data: {
        endedAt: new Date(),
        endedById: user.id,
        endReason: reason,
      },
    });

    await createNotification(
      {
        recipientId: tenancy.tenantId,
        eventType: "TENANCY_ENDED",
        resourceType: "Tenancy",
        resourceId: tenancy.id,
        messageKey: "notifications.tenancy_ended",
        messageParams: { unitLabel: tenancy.unit.label, reason },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "TENANCY_ENDED",
        entityType: "Tenancy",
        entityId: tenancyId,
        reason,
      },
      tx
    );

    return updated;
  });
}

export async function getTenantActiveMembership(user: AuthUser) {
  assertTenant(user);

  const activeTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, endedAt: null },
    include: {
      unit: {
        include: {
          building: true,
        },
      },
    },
  });

  const pendingRequest = await prisma.membershipRequest.findFirst({
    where: { tenantId: user.id, status: MembershipStatus.PENDING },
    include: {
      unit: {
        include: {
          building: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { activeTenancy, pendingRequest };
}
