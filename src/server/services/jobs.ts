import { prisma } from "@/server/db";
import { AuthUser, assertWorker, assertTenant, assertOwner, AuthorizationError } from "@/server/policies";
import { RequestStatus, Role } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

export async function startWork(user: AuthUser, workOrderId: string) {
  assertWorker(user);

  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        request: { include: { unit: { include: { building: true } } } },
      },
    });

    if (!workOrder) throw new Error("WORK_ORDER_NOT_FOUND");
    if (workOrder.workerId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("FORBIDDEN");
    }

    if (workOrder.request.status !== RequestStatus.ASSIGNED) {
      throw new Error("REQUEST_NOT_ASSIGNED");
    }

    const updatedOrder = await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        startedAt: new Date(),
        startedById: user.id,
      },
    });

    await tx.maintenanceRequest.update({
      where: { id: workOrder.requestId },
      data: { status: RequestStatus.IN_PROGRESS },
    });

    // Notify tenant and owner
    await createNotification(
      {
        recipientId: workOrder.request.namedTenantId,
        eventType: "WORK_STARTED",
        resourceType: "WorkOrder",
        resourceId: workOrderId,
        messageKey: "notifications.work_started",
        messageParams: { title: workOrder.request.title },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "WORK_STARTED",
        entityType: "WorkOrder",
        entityId: workOrderId,
        requestId: workOrder.requestId,
        newState: { status: RequestStatus.IN_PROGRESS },
      },
      tx
    );

    return updatedOrder;
  });
}

export async function reportCompletion(
  user: AuthUser,
  workOrderId: string,
  data: { completionNotes: string; attachmentIds?: string[] }
) {
  assertWorker(user);

  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        request: { include: { unit: { include: { building: true } } } },
      },
    });

    if (!workOrder) throw new Error("WORK_ORDER_NOT_FOUND");
    if (workOrder.workerId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("FORBIDDEN");
    }

    if (workOrder.request.status !== RequestStatus.IN_PROGRESS) {
      throw new Error("REQUEST_NOT_IN_PROGRESS");
    }

    const updatedOrder = await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        completedAt: new Date(),
        completedById: user.id,
        completionNotes: data.completionNotes.trim(),
      },
    });

    // Add completion attachments
    if (data.attachmentIds && data.attachmentIds.length > 0) {
      await tx.completionAttachment.createMany({
        data: data.attachmentIds.map((attachmentId) => ({
          workOrderId,
          attachmentId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.maintenanceRequest.update({
      where: { id: workOrder.requestId },
      data: { status: RequestStatus.AWAITING_TENANT_CONFIRMATION },
    });

    // Notify tenant
    await createNotification(
      {
        recipientId: workOrder.request.namedTenantId,
        eventType: "WORK_COMPLETED_AWAITING_CONFIRMATION",
        resourceType: "WorkOrder",
        resourceId: workOrderId,
        messageKey: "notifications.work_completed_tenant_confirm",
        messageParams: { title: workOrder.request.title },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "WORK_COMPLETED",
        entityType: "WorkOrder",
        entityId: workOrderId,
        requestId: workOrder.requestId,
        newState: { status: RequestStatus.AWAITING_TENANT_CONFIRMATION, notes: data.completionNotes },
      },
      tx
    );

    return updatedOrder;
  });
}

export async function requestRework(
  user: AuthUser,
  requestId: string,
  reason: string
) {
  assertTenant(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: { workOrder: true },
    });

    if (!request || !request.workOrder) throw new Error("REQUEST_NOT_FOUND");

    // Named tenant ONLY (or Super Admin)
    if (request.namedTenantId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("ONLY_NAMED_TENANT_CAN_REQUEST_REWORK");
    }

    if (request.status !== RequestStatus.AWAITING_TENANT_CONFIRMATION) {
      throw new Error("REQUEST_NOT_AWAITING_CONFIRMATION");
    }

    // Return to IN_PROGRESS
    const updatedRequest = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.IN_PROGRESS },
    });

    // Notify worker
    await createNotification(
      {
        recipientId: request.workOrder.workerId,
        eventType: "REWORK_REQUESTED",
        resourceType: "WorkOrder",
        resourceId: request.workOrder.id,
        messageKey: "notifications.rework_requested",
        messageParams: { title: request.title, reason },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "REWORK_REQUESTED",
        entityType: "WorkOrder",
        entityId: request.workOrder.id,
        requestId,
        reason,
        previousState: { status: RequestStatus.AWAITING_TENANT_CONFIRMATION },
        newState: { status: RequestStatus.IN_PROGRESS },
      },
      tx
    );

    return updatedRequest;
  });
}

export async function confirmExecution(user: AuthUser, requestId: string) {
  assertTenant(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: {
        workOrder: true,
        unit: { include: { building: true } },
      },
    });

    if (!request || !request.workOrder) throw new Error("REQUEST_NOT_FOUND");

    // Strictly the named tenant (or Super Admin). Owner cannot substitute for tenant confirmation!
    if (request.namedTenantId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("ONLY_NAMED_TENANT_CAN_CONFIRM_EXECUTION");
    }

    if (request.status !== RequestStatus.AWAITING_TENANT_CONFIRMATION) {
      throw new Error("REQUEST_NOT_AWAITING_CONFIRMATION");
    }

    await tx.workOrder.update({
      where: { id: request.workOrder.id },
      data: {
        confirmedAt: new Date(),
        confirmedById: user.id,
      },
    });

    const updatedRequest = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.TENANT_CONFIRMED },
    });

    // Notify owner that task is ready for closure
    await createNotification(
      {
        recipientId: request.unit.building.ownerId,
        eventType: "TENANT_CONFIRMED_EXECUTION",
        resourceType: "WorkOrder",
        resourceId: request.workOrder.id,
        messageKey: "notifications.tenant_confirmed",
        messageParams: { title: request.title },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "TENANT_CONFIRMED",
        entityType: "WorkOrder",
        entityId: request.workOrder.id,
        requestId,
        previousState: { status: RequestStatus.AWAITING_TENANT_CONFIRMATION },
        newState: { status: RequestStatus.TENANT_CONFIRMED },
      },
      tx
    );

    return updatedRequest;
  });
}

export async function closeTask(user: AuthUser, requestId: string) {
  assertOwner(user);

  return prisma.$transaction(async (tx) => {
    const request = await tx.maintenanceRequest.findUnique({
      where: { id: requestId },
      include: {
        workOrder: true,
        unit: { include: { building: true } },
      },
    });

    if (!request || !request.workOrder) throw new Error("REQUEST_NOT_FOUND");

    if (request.unit.building.ownerId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("FORBIDDEN");
    }

    // Owner closure requires recorded tenant confirmation! (Section 5.3, 5.7)
    if (request.status !== RequestStatus.TENANT_CONFIRMED) {
      throw new Error("CANNOT_CLOSE_BEFORE_TENANT_CONFIRMATION");
    }

    await tx.workOrder.update({
      where: { id: request.workOrder.id },
      data: {
        closedAt: new Date(),
        closedById: user.id,
      },
    });

    const updatedRequest = await tx.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.CLOSED },
    });

    // Notify worker and tenant
    await createNotification(
      {
        recipientId: request.workOrder.workerId,
        eventType: "TASK_CLOSED",
        resourceType: "WorkOrder",
        resourceId: request.workOrder.id,
        messageKey: "notifications.task_closed",
        messageParams: { title: request.title },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "TASK_CLOSED",
        entityType: "WorkOrder",
        entityId: request.workOrder.id,
        requestId,
        previousState: { status: RequestStatus.TENANT_CONFIRMED },
        newState: { status: RequestStatus.CLOSED },
      },
      tx
    );

    return updatedRequest;
  });
}
