import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

export interface CreateAuditParams {
  actorId?: string | null;
  action: string;
  entityType?: string;
  resourceType?: string;
  entityId?: string;
  resourceId?: string;
  requestId?: string | null;
  previousState?: any;
  newState?: any;
  reason?: string | null;
  correlationKey?: string | null;
}

export interface CreateNotificationParams {
  recipientId: string;
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  messageKey: string;
  messageParams?: Record<string, any>;
  deduplicationKey?: string;
}

export async function createAuditEvent(
  params: CreateAuditParams,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  return client.auditEvent.create({
    data: {
      actorId: params.actorId || null,
      action: params.action,
      resourceType: params.resourceType || params.entityType || "Unknown",
      resourceId: params.resourceId || params.entityId || "Unknown",
      requestId: params.requestId || null,
      previousState: params.previousState ? JSON.parse(JSON.stringify(params.previousState)) : undefined,
      newState: params.newState ? JSON.parse(JSON.stringify(params.newState)) : undefined,
      reason: params.reason || null,
      correlationKey: params.correlationKey || null,
    },
  });
}

export async function createNotification(
  params: CreateNotificationParams,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  if (params.deduplicationKey) {
    const existing = await client.notification.findUnique({
      where: { deduplicationKey: params.deduplicationKey },
    });
    if (existing) return existing;
  }

  return client.notification.create({
    data: {
      recipientId: params.recipientId,
      eventType: params.eventType,
      resourceType: params.resourceType || null,
      resourceId: params.resourceId || null,
      messageKey: params.messageKey,
      messageParams: params.messageParams || undefined,
      deduplicationKey: params.deduplicationKey || null,
    },
  });
}
