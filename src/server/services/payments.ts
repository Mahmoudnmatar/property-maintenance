import { prisma } from "@/server/db";
import { AuthUser, assertOwner, AuthorizationError } from "@/server/policies";
import { PaymentStatus, Role } from "@prisma/client";
import { createAuditEvent, createNotification } from "./events";

// ─── Currency Helpers (ILS Agorot) ───────────────────────────────────────────

export function ilsToAgorot(ils: number | string): number {
  const num = typeof ils === "string" ? parseFloat(ils.replace(",", ".")) : ils;
  if (isNaN(num)) throw new Error("INVALID_AMOUNT");
  return Math.round(num * 100);
}

export function agorotToIls(agorot: number): number {
  return agorot / 100;
}

export function formatIls(agorot: number, locale = "ar"): string {
  const ils = agorotToIls(agorot);
  return new Intl.NumberFormat(locale === "ar" ? "ar-IL" : "en-IL", {
    style: "currency",
    currency: "ILS",
  }).format(ils);
}

export function derivePaymentStatus(paidAgorot: number, agreedAgorot: number): PaymentStatus {
  if (paidAgorot <= 0) return PaymentStatus.UNPAID;
  if (paidAgorot < agreedAgorot) return PaymentStatus.PARTIALLY_PAID;
  return PaymentStatus.PAID;
}

// ─── Recording External Payments ─────────────────────────────────────────────

export async function recordExternalPayment(
  user: AuthUser,
  workOrderId: string,
  data: {
    cumulativePaidAgorot: number;
    paymentDate?: Date | string;
    reference?: string;
    note?: string;
    correctionReason?: string;
  }
) {
  assertOwner(user);

  if (data.cumulativePaidAgorot < 0) {
    throw new Error("PAID_AMOUNT_CANNOT_BE_NEGATIVE");
  }

  return prisma.$transaction(async (tx) => {
    const workOrder = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        request: { include: { unit: { include: { building: true } } } },
        paymentRecord: true,
      },
    });

    if (!workOrder) throw new Error("WORK_ORDER_NOT_FOUND");

    if (workOrder.request.unit.building.ownerId !== user.id && user.role !== Role.SUPER_ADMIN) {
      throw new AuthorizationError("FORBIDDEN");
    }

    // Overpayment check
    if (data.cumulativePaidAgorot > workOrder.agreedAmountAgorot) {
      throw new Error("PAID_AMOUNT_EXCEEDS_AGREED_TOTAL");
    }

    let record = workOrder.paymentRecord;

    if (record) {
      // Record correction in PaymentHistory
      await tx.paymentHistory.create({
        data: {
          paymentRecordId: record.id,
          previousAgorot: record.paidAgorot,
          newAgorot: data.cumulativePaidAgorot,
          reason: data.correctionReason || "Payment amount updated",
          recordedById: user.id,
        },
      });

      record = await tx.paymentRecord.update({
        where: { id: record.id },
        data: {
          paidAgorot: data.cumulativePaidAgorot,
          lastPaymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          lastPaymentRef: data.reference || null,
          note: data.note || null,
          version: record.version + 1,
        },
      });
    } else {
      record = await tx.paymentRecord.create({
        data: {
          workOrderId,
          recordedById: user.id,
          paidAgorot: data.cumulativePaidAgorot,
          lastPaymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          lastPaymentRef: data.reference || null,
          note: data.note || null,
          version: 1,
        },
      });
    }

    // Notify worker of payment record update
    await createNotification(
      {
        recipientId: workOrder.workerId,
        eventType: "PAYMENT_RECORD_UPDATED",
        resourceType: "PaymentRecord",
        resourceId: record.id,
        messageKey: "notifications.payment_updated",
        messageParams: {
          title: workOrder.request.title,
          amount: formatIls(data.cumulativePaidAgorot),
        },
      },
      tx
    );

    await createAuditEvent(
      {
        actorId: user.id,
        action: "PAYMENT_RECORDED",
        entityType: "PaymentRecord",
        entityId: record.id,
        requestId: workOrder.requestId,
        newState: record,
      },
      tx
    );

    const derivedStatus = derivePaymentStatus(record.paidAgorot, workOrder.agreedAmountAgorot);

    return {
      record,
      status: derivedStatus,
      agreedTotal: workOrder.agreedAmountAgorot,
      remainingAgorot: Math.max(0, workOrder.agreedAmountAgorot - record.paidAgorot),
    };
  });
}

export async function getOwnerPaymentsSummary(user: AuthUser) {
  assertOwner(user);

  return prisma.workOrder.findMany({
    where: {
      request: {
        unit: {
          building: {
            ownerId: user.role === Role.SUPER_ADMIN ? undefined : user.id,
          },
        },
      },
    },
    include: {
      request: {
        include: {
          unit: { include: { building: true } },
          category: true,
        },
      },
      worker: { select: { id: true, name: true } },
      paymentRecord: {
        include: { history: { orderBy: { createdAt: "desc" } } },
      },
    },
    orderBy: { assignedAt: "desc" },
  });
}
