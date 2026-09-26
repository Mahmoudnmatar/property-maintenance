import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/server/db";
import { registerUser } from "../src/server/auth/actions";
import { ilsToAgorot, agorotToIls, derivePaymentStatus, formatIls } from "../src/server/services/payments";
import { createBuilding, createUnit, requestMembership, approveMembership, endTenancy } from "../src/server/services/properties";
import { submitWorkerApplication, updateWorkerDraft, evaluateAndDecideWorkerApplication, suspendWorker } from "../src/server/services/workers";
import { createMaintenanceRequest, acceptRequestForProcurement } from "../src/server/services/requests";
import { createProcurementRound, submitOrReviseOffer, acceptOfferAndAward } from "../src/server/services/procurement";
import { startWork, reportCompletion, confirmExecution, requestRework, closeTask } from "../src/server/services/jobs";
import { recordExternalPayment } from "../src/server/services/payments";
import { submitTenantFeedback, getWorkerFeedbackSummary, moderateFeedback } from "../src/server/services/feedback";
import { Role, WorkerStatus, ProcurementMode, RequestStatus, PaymentStatus } from "@prisma/client";

describe("Domain Business Invariants & Acceptance Tests (T01 - T27)", () => {
  let adminUser: any;
  let ownerUser: any;
  let tenantUser: any;
  let workerUser: any;
  let secondWorkerUser: any;
  let testCategory: any;
  let testArea: any;
  let building: any;
  let unit: any;

  beforeAll(async () => {
    // Clean test db
    await prisma.notification.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.tenantFeedback.deleteMany();
    await prisma.paymentHistory.deleteMany();
    await prisma.paymentRecord.deleteMany();
    await prisma.completionAttachment.deleteMany();
    await prisma.commentAttachment.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.requestAttachment.deleteMany();
    await prisma.procurementImage.deleteMany();
    await prisma.attachment.deleteMany();
    await prisma.workOrder.deleteMany();
    await prisma.offer.deleteMany();
    await prisma.procurement.deleteMany();
    await prisma.maintenanceRequest.deleteMany();
    await prisma.tenancy.deleteMany();
    await prisma.membershipRequest.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.building.deleteMany();
    await prisma.adminEvaluation.deleteMany();
    await prisma.workerSubmission.deleteMany();
    await prisma.workerCategory.deleteMany();
    await prisma.workerServiceArea.deleteMany();
    await prisma.workerProfile.deleteMany();
    await prisma.serviceCategory.deleteMany();
    await prisma.serviceArea.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();

    adminUser = await prisma.user.create({
      data: { name: "Admin", email: "admin.test@test.local", role: Role.SUPER_ADMIN },
    });
    ownerUser = await prisma.user.create({
      data: { name: "Owner", email: "owner.test@test.local", role: Role.OWNER },
    });
    tenantUser = await prisma.user.create({
      data: { name: "Tenant", email: "tenant.test@test.local", role: Role.TENANT },
    });
    workerUser = await prisma.user.create({
      data: { name: "Worker1", email: "worker1.test@test.local", role: Role.WORKER },
    });
    secondWorkerUser = await prisma.user.create({
      data: { name: "Worker2", email: "worker2.test@test.local", role: Role.WORKER },
    });

    testCategory = await prisma.serviceCategory.create({
      data: { code: "TEST_PLUMBING", nameEn: "Plumbing", nameAr: "سباكة" },
    });
    testArea = await prisma.serviceArea.create({
      data: { code: "TEST_AREA", nameEn: "Area 1", nameAr: "منطقة 1" },
    });

    building = await createBuilding(ownerUser, {
      nameEn: "Test Building",
      address: "123 Test St",
    });
    unit = await createUnit(ownerUser, building.id, { label: "101" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // T01: Super Admin role escalation rejected
  it("T01: Rejects SUPER_ADMIN self-registration on server side", async () => {
    const formData = new FormData();
    formData.append("name", "Hacker");
    formData.append("email", "hacker@test.local");
    formData.append("password", "Secret123!");
    formData.append("role", "SUPER_ADMIN");

    const result = await registerUser(formData);
    expect(result.error).toBe("INVALID_ROLE_SELF_REGISTRATION_RESTRICTED");
  });

  // T20: Agorot conversion and payment status derivation
  it("T20: Exactly converts ILS to integer agorot and derives status correctly", () => {
    expect(ilsToAgorot("125.50")).toBe(12550);
    expect(ilsToAgorot(125.5)).toBe(12550);
    expect(agorotToIls(12550)).toBe(125.5);

    expect(derivePaymentStatus(0, 12550)).toBe(PaymentStatus.UNPAID);
    expect(derivePaymentStatus(4000, 12550)).toBe(PaymentStatus.PARTIALLY_PAID);
    expect(derivePaymentStatus(12550, 12550)).toBe(PaymentStatus.PAID);
  });

  // T03: Tenant membership & request lifecycle
  it("T03 & T04: Tenant joins unit, owner approves, active tenancy enforced", async () => {
    // 1. Submit membership request
    const req = await requestMembership(tenantUser, {
      joinCode: building.joinCode,
      unitLabel: unit.label,
    });
    expect(req.status).toBe("PENDING");

    // 2. Approve membership
    const approved = await approveMembership(ownerUser, req.id);
    expect(approved.request.status).toBe("APPROVED");
    expect(approved.tenancy).toBeDefined();

    // 3. T04: Second tenant cannot join already occupied unit
    const secondTenant = await prisma.user.create({
      data: { name: "Tenant2", email: "tenant2.test@test.local", role: Role.TENANT },
    });
    await expect(
      requestMembership(secondTenant, {
        joinCode: building.joinCode,
        unitLabel: unit.label,
      })
    ).rejects.toThrow("UNIT_ALREADY_OCCUPIED");
  });

  // T05 & T06: Worker application, admin evaluation, and approval
  it("T05 & T06: Worker profile, evidence check, admin scoring (1-5), and approval", async () => {
    // 1. Update draft profile
    await updateWorkerDraft(workerUser, {
      bio: "10 years plumbing experience",
      categories: [{ categoryId: testCategory.id, experienceYears: 10 }],
      areaIds: [testArea.id],
    });

    const profile = await prisma.workerProfile.findUnique({
      where: { userId: workerUser.id },
    });

    // Add required evidence
    const att1 = await prisma.attachment.create({
      data: { uploaderId: workerUser.id, storageKey: "p1.jpg", originalName: "p1.jpg", mimeType: "image/jpeg", sizeBytes: 100 },
    });
    const att2 = await prisma.attachment.create({
      data: { uploaderId: workerUser.id, storageKey: "c1.pdf", originalName: "c1.pdf", mimeType: "application/pdf", sizeBytes: 200 },
    });

    await prisma.workerEvidence.createMany({
      data: [
        { workerProfileId: profile!.id, attachmentId: att1.id, kind: "PORTFOLIO", publishConsent: true },
        { workerProfileId: profile!.id, attachmentId: att2.id, kind: "CERTIFICATE", publishConsent: false },
      ],
    });

    // Submit application
    const submitted = await submitWorkerApplication(workerUser);
    expect(submitted.status).toBe("PENDING_REVIEW");

    // Admin evaluates and approves
    const approved = await evaluateAndDecideWorkerApplication(
      adminUser,
      profile!.id,
      "APPROVED",
      [{ categoryId: testCategory.id, score: 5, publicSummary: "Excellent certified plumber" }]
    );
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedRevision).toBe(1);
  });

  // T08, T13, T14, T16, T17, T18: Direct job lifecycle end-to-end
  it("T08, T16, T17, T18: Full maintenance lifecycle with atomic award, completion, rework, tenant confirmation, and closure", async () => {
    // 1. Tenant submits request
    const maintReq = await createMaintenanceRequest(tenantUser, {
      unitId: unit.id,
      categoryId: testCategory.id,
      title: "Broken Pipe Leak",
      description: "Water leaking under sink",
    });
    expect(maintReq.status).toBe("SUBMITTED");

    // 2. Owner accepts for sourcing
    await acceptRequestForProcurement(ownerUser, maintReq.id);

    // 3. Owner creates DIRECT procurement round with approved worker
    const proc = await createProcurementRound(ownerUser, maintReq.id, {
      mode: ProcurementMode.DIRECT,
      directWorkerId: workerUser.id,
    });
    expect(proc.status).toBe("OPEN");

    // 4. Worker submits quote (125.50 ILS = 12550 agorot)
    const offer = await submitOrReviseOffer(workerUser, proc.id, {
      amountAgorot: 12550,
      scopeText: "Replace pipe and valve",
    });
    expect(offer.version).toBe(1);

    // 5. Owner accepts offer and awards
    const workOrder = await acceptOfferAndAward(ownerUser, offer.id, 1);
    expect(workOrder.agreedAmountAgorot).toBe(12550);
    expect(workOrder.offerVersion).toBe(1);

    // 6. Worker starts work
    await startWork(workerUser, workOrder.id);
    let currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("IN_PROGRESS");

    // 7. Worker reports completion
    await reportCompletion(workerUser, workOrder.id, { completionNotes: "All pipes replaced" });
    currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("AWAITING_TENANT_CONFIRMATION");

    // 8. T16: Owner CANNOT close task before tenant confirmation!
    await expect(closeTask(ownerUser, maintReq.id)).rejects.toThrow("CANNOT_CLOSE_BEFORE_TENANT_CONFIRMATION");

    // 9. T17: Tenant requests rework -> status returns to IN_PROGRESS
    await requestRework(tenantUser, maintReq.id, "Leak is still dripping slightly");
    currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("IN_PROGRESS");

    // 10. Worker reports completion again
    await reportCompletion(workerUser, workOrder.id, { completionNotes: "Fixed seal tight" });
    currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("AWAITING_TENANT_CONFIRMATION");

    // 11. Tenant confirms execution
    await confirmExecution(tenantUser, maintReq.id);
    currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("TENANT_CONFIRMED");

    // 12. Owner closes task
    await closeTask(ownerUser, maintReq.id);
    currentReq = await prisma.maintenanceRequest.findUnique({ where: { id: maintReq.id } });
    expect(currentReq?.status).toBe("CLOSED");

    // 13. T18: Tenant gives 5-star feedback
    const feedback = await submitTenantFeedback(tenantUser, workOrder.id, {
      rating: 5,
      comment: "Great persistent work!",
    });
    expect(feedback.rating).toBe(5);

    // Feedback summary separates stats
    const stats = await getWorkerFeedbackSummary(workerUser.id);
    expect(stats.count).toBe(1);
    expect(stats.average).toBe(5);

    // 14. T20 & T21: Record external payments
    const payRes = await recordExternalPayment(ownerUser, workOrder.id, {
      cumulativePaidAgorot: 12550,
      reference: "REC-001",
    });
    expect(payRes.status).toBe(PaymentStatus.PAID);
    expect(payRes.remainingAgorot).toBe(0);

    // Cannot overpay
    await expect(
      recordExternalPayment(ownerUser, workOrder.id, {
        cumulativePaidAgorot: 20000,
      })
    ).rejects.toThrow("PAID_AMOUNT_EXCEEDS_AGREED_TOTAL");
  });
});
