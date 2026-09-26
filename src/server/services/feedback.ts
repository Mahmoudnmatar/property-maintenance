import { prisma } from "@/server/db";
import { AuthUser, assertTenant, assertSuperAdmin, AuthorizationError } from "@/server/policies";
import { RequestStatus, Role } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

export async function submitTenantFeedback(
  user: AuthUser,
  workOrderId: string,
  data: { rating: number; comment?: string }
) {
  assertTenant(user);

  if (data.rating < 1 || data.rating > 5 || !Number.isInteger(data.rating)) {
    throw new Error("RATING_MUST_BE_INTEGER_1_TO_5");
  }

  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        request: true,
        feedback: true,
      },
    });

    if (!workOrder) throw new Error("WORK_ORDER_NOT_FOUND");

    // Only the named tenant
    if (workOrder.request.namedTenantId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("ONLY_NAMED_TENANT_CAN_LEAVE_FEEDBACK");
    }

    // Must be at least tenant-confirmed
    const eligible =
      workOrder.request.status === RequestStatus.TENANT_CONFIRMED ||
      workOrder.request.status === RequestStatus.CLOSED;

    if (!eligible) {
      throw new Error("FEEDBACK_ONLY_AFTER_TENANT_CONFIRMATION");
    }

    // One feedback submission per work order (no duplicates/re-editing)
    if (workOrder.feedback) {
      throw new Error("FEEDBACK_ALREADY_SUBMITTED");
    }

    const feedback = await tx.tenantFeedback.create({
      data: {
        workOrderId,
        requestId: workOrder.requestId,
        tenantId: user.id,
        workerId: workOrder.workerId,
        rating: data.rating,
        comment: data.comment?.trim() || null,
      },
    });

    // Notify worker
    await createNotification(
      {
        recipientId: workOrder.workerId,
        eventType: "TENANT_FEEDBACK_RECEIVED",
        resourceType: "TenantFeedback",
        resourceId: feedback.id,
        messageKey: "notifications.feedback_received",
        messageParams: { title: workOrder.request.title, rating: data.rating },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "FEEDBACK_SUBMITTED",
        entityType: "TenantFeedback",
        entityId: feedback.id,
        requestId: workOrder.requestId,
        newState: feedback,
      },
      tx
    );

    return feedback;
  });
}

export async function moderateFeedback(
  user: AuthUser,
  feedbackId: string,
  hideReason: string
) {
  assertSuperAdmin(user);

  return prisma.$transaction(async (tx) => {
    const feedback = await tx.tenantFeedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) throw new Error("NOT_FOUND");

    const updated = await tx.tenantFeedback.update({
      where: { id: feedbackId },
      data: {
        hiddenAt: new Date(),
        hiddenById: user.id,
        hideReason,
      },
    });

    await createAuditEvent(
      {
        actorId: user.id,
        action: "FEEDBACK_MODERATED",
        entityType: "TenantFeedback",
        entityId: feedbackId,
        requestId: feedback.requestId,
        reason: hideReason,
        previousState: { hiddenAt: feedback.hiddenAt },
        newState: { hiddenAt: updated.hiddenAt, hideReason },
      },
      tx
    );

    return updated;
  });
}

export async function getWorkerFeedbackSummary(workerId: string) {
  const visibleFeedbacks = await prisma.tenantFeedback.findMany({
    where: {
      workerId,
      hiddenAt: null,
      request: {
        status: { in: [RequestStatus.TENANT_CONFIRMED, RequestStatus.CLOSED] },
      },
    },
    include: {
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const count = visibleFeedbacks.length;
  const average =
    count > 0
      ? visibleFeedbacks.reduce((sum, f) => sum + f.rating, 0) / count
      : null;

  return {
    count,
    average: average ? Math.round(average * 10) / 10 : null,
    feedbacks: visibleFeedbacks,
  };
}
