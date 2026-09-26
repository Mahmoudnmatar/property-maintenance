import { prisma } from "../src/server/db";
import { hashPassword } from "better-auth/crypto";
import {
  Role,
  WorkerStatus,
  EvidenceKind,
  UnitType,
  MembershipStatus,
  RequestStatus,
  Urgency,
  ProcurementMode,
  ProcurementStatus,
  OfferStatus,
} from "@prisma/client";

async function main() {
  console.log("🌱 Seeding database fixtures...");

  // Clean existing data for clean seed in development
  await prisma.notification.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.tenantFeedback.deleteMany();
  await prisma.paymentHistory.deleteMany();
  await prisma.paymentRecord.deleteMany();
  await prisma.completionAttachment.deleteMany();
  await prisma.commentAttachment.deleteMany();
  await prisma.procurementImage.deleteMany();
  await prisma.requestAttachment.deleteMany();
  await prisma.workerEvidence.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.tenderInvitation.deleteMany();
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

  const commonPassword = await hashPassword("Password123!");

  // ─── 1. Super Admin ────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name: "Super Admin (مسؤول النظام)",
      email: "admin@property.local",
      role: Role.SUPER_ADMIN,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "admin@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  // ─── 2. Service Categories ─────────────────────────────────────────────────
  const catPlumbing = await prisma.serviceCategory.create({
    data: { code: "PLUMBING", nameEn: "Plumbing", nameAr: "السباكة", displayOrder: 1 },
  });
  const catElectrical = await prisma.serviceCategory.create({
    data: { code: "ELECTRICAL", nameEn: "Electrical", nameAr: "الكهرباء", displayOrder: 2 },
  });
  const catHvac = await prisma.serviceCategory.create({
    data: { code: "HVAC", nameEn: "Air Conditioning", nameAr: "التكييف والتبريد", displayOrder: 3 },
  });
  const catAppliances = await prisma.serviceCategory.create({
    data: { code: "APPLIANCES", nameEn: "Appliance Repair", nameAr: "صيانة الأجهزة", displayOrder: 4 },
  });
  const catPainting = await prisma.serviceCategory.create({
    data: { code: "PAINTING", nameEn: "Painting", nameAr: "الدهان والتشطيبات", displayOrder: 5 },
  });
  const catCarpentry = await prisma.serviceCategory.create({
    data: { code: "CARPENTRY", nameEn: "Carpentry", nameAr: "النجارة", displayOrder: 6 },
  });

  // ─── 3. Service Areas ──────────────────────────────────────────────────────
  const area1 = await prisma.serviceArea.create({
    data: { code: "AREA_CENTRAL", nameEn: "Central Area (المنطقة الوسطى)", nameAr: "المنطقة الوسطى" },
  });
  const area2 = await prisma.serviceArea.create({
    data: { code: "AREA_NORTH", nameEn: "Northern Area (المنطقة الشمالية)", nameAr: "المنطقة الشمالية" },
  });
  const area3 = await prisma.serviceArea.create({
    data: { code: "AREA_SOUTH", nameEn: "Southern Area (المنطقة الجنوبية)", nameAr: "المنطقة الجنوبية" },
  });

  // ─── 4. Owners ─────────────────────────────────────────────────────────────
  const owner1 = await prisma.user.create({
    data: {
      name: "Tariq Owner (طارق صاحب العقار)",
      email: "owner1@property.local",
      role: Role.OWNER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "owner1@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const owner2 = await prisma.user.create({
    data: {
      name: "Samir Owner (سمير مالك العقارات)",
      email: "owner2@property.local",
      role: Role.OWNER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "owner2@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  // ─── 5. Buildings & Units ──────────────────────────────────────────────────
  const bldg1 = await prisma.building.create({
    data: {
      ownerId: owner1.id,
      nameEn: "Al-Noor Tower",
      nameAr: "برج النور",
      address: "Palestine St. 10, Central Area",
      joinCode: "NOOR2026",
    },
  });

  const unit101 = await prisma.unit.create({
    data: { buildingId: bldg1.id, label: "101", type: UnitType.APARTMENT, floor: "1" },
  });
  const unit102 = await prisma.unit.create({
    data: { buildingId: bldg1.id, label: "102", type: UnitType.APARTMENT, floor: "1" },
  });
  const shop1 = await prisma.unit.create({
    data: { buildingId: bldg1.id, label: "Shop A", type: UnitType.SHOP, floor: "Ground" },
  });

  const bldg2 = await prisma.building.create({
    data: {
      ownerId: owner2.id,
      nameEn: "Al-Amal Complex",
      nameAr: "مجمع الأمل",
      address: "Market Street 5, Northern Area",
      joinCode: "AMAL2026",
    },
  });

  const unit201 = await prisma.unit.create({
    data: { buildingId: bldg2.id, label: "201", type: UnitType.APARTMENT, floor: "2" },
  });

  // ─── 6. Tenants ────────────────────────────────────────────────────────────
  const tenant1 = await prisma.user.create({
    data: {
      name: "Ahmed Qaddoura (أحمد قدورة)",
      email: "tenant1@property.local",
      role: Role.TENANT,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "tenant1@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const tenant2 = await prisma.user.create({
    data: {
      name: "Layla Tenant (ليلى المستأجرة)",
      email: "tenant2@property.local",
      role: Role.TENANT,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "tenant2@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const tenantPending = await prisma.user.create({
    data: {
      name: "Omar Applicant (عمر متقدم بالطلب)",
      email: "tenant.pending@property.local",
      role: Role.TENANT,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "tenant.pending@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  // Tenancies
  const membership1 = await prisma.membershipRequest.create({
    data: {
      unitId: unit101.id,
      tenantId: tenant1.id,
      status: MembershipStatus.APPROVED,
      decidedById: owner1.id,
      decidedAt: new Date(),
    },
  });

  await prisma.tenancy.create({
    data: {
      unitId: unit101.id,
      tenantId: tenant1.id,
      membershipRequestId: membership1.id,
      startedAt: new Date(),
    },
  });

  const membership2 = await prisma.membershipRequest.create({
    data: {
      unitId: unit201.id,
      tenantId: tenant2.id,
      status: MembershipStatus.APPROVED,
      decidedById: owner2.id,
      decidedAt: new Date(),
    },
  });

  await prisma.tenancy.create({
    data: {
      unitId: unit201.id,
      tenantId: tenant2.id,
      membershipRequestId: membership2.id,
      startedAt: new Date(),
    },
  });

  // Pending membership request for unit102
  await prisma.membershipRequest.create({
    data: {
      unitId: unit102.id,
      tenantId: tenantPending.id,
      status: MembershipStatus.PENDING,
    },
  });

  // ─── 7. Workers ────────────────────────────────────────────────────────────
  // Worker 1: Approved Plumber & Electrician
  const worker1 = await prisma.user.create({
    data: {
      name: "Mahmoud Plumber (محمود السباك)",
      email: "worker1@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker1@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const wp1 = await prisma.workerProfile.create({
    data: {
      userId: worker1.id,
      status: WorkerStatus.APPROVED,
      bio: "خبرة 10 سنوات في صيانة السباكة والتمديدات الصحية وشبكات المياه (10 years experience in plumbing)",
      currentRevision: 1,
      submittedRevision: 1,
      approvedRevision: 1,
      submittedAt: new Date(),
      decidedAt: new Date(),
      reviewedById: admin.id,
    },
  });

  await prisma.workerCategory.create({
    data: { workerProfileId: wp1.id, categoryId: catPlumbing.id, experienceYears: 10 },
  });
  await prisma.workerServiceArea.create({
    data: { workerProfileId: wp1.id, areaId: area1.id },
  });

  await prisma.adminEvaluation.create({
    data: {
      workerProfileId: wp1.id,
      profileRevision: 1,
      categoryId: catPlumbing.id,
      adminId: admin.id,
      score: 5,
      publicSummary: "فني معتمد ذو خبرة ممتازة وسجل أعمال موثق (Certified professional with verified track record)",
      privateNotes: "Certificates verified against training institute records.",
    },
  });

  // Worker 2: Approved Plumber (matching category/area for tender comparisons)
  const worker2 = await prisma.user.create({
    data: {
      name: "Khaled Sanitaries (خالد التمديدات)",
      email: "worker2@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker2@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const wp2 = await prisma.workerProfile.create({
    data: {
      userId: worker2.id,
      status: WorkerStatus.APPROVED,
      bio: "سباكة عامة وصيانة سريعة ومضخات مياه (General plumbing and pump repair)",
      currentRevision: 1,
      submittedRevision: 1,
      approvedRevision: 1,
      submittedAt: new Date(),
      decidedAt: new Date(),
      reviewedById: admin.id,
    },
  });

  await prisma.workerCategory.create({
    data: { workerProfileId: wp2.id, categoryId: catPlumbing.id, experienceYears: 6 },
  });
  await prisma.workerServiceArea.create({
    data: { workerProfileId: wp2.id, areaId: area1.id },
  });

  await prisma.adminEvaluation.create({
    data: {
      workerProfileId: wp2.id,
      profileRevision: 1,
      categoryId: catPlumbing.id,
      adminId: admin.id,
      score: 4,
      publicSummary: "خبرة جيدة جداً في صيانة الشبكات والمضخات (Very good expertise in pumps and networks)",
    },
  });

  // Worker 3: Approved Plumber (3rd for comparison)
  const worker3 = await prisma.user.create({
    data: {
      name: "Bilal Repairs (بلال للصيانة)",
      email: "worker3@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker3@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const wp3 = await prisma.workerProfile.create({
    data: {
      userId: worker3.id,
      status: WorkerStatus.APPROVED,
      bio: "سباك محترف للأعمال الطارئة (Professional emergency plumber)",
      currentRevision: 1,
      submittedRevision: 1,
      approvedRevision: 1,
      submittedAt: new Date(),
      decidedAt: new Date(),
      reviewedById: admin.id,
    },
  });

  await prisma.workerCategory.create({
    data: { workerProfileId: wp3.id, categoryId: catPlumbing.id, experienceYears: 4 },
  });
  await prisma.workerServiceArea.create({
    data: { workerProfileId: wp3.id, areaId: area1.id },
  });

  await prisma.adminEvaluation.create({
    data: {
      workerProfileId: wp3.id,
      profileRevision: 1,
      categoryId: catPlumbing.id,
      adminId: admin.id,
      score: 4,
      publicSummary: "مهني ملتزم وموثوق (Reliable and committed professional)",
    },
  });

  // Worker 4: Approved Electrician (different category)
  const worker4 = await prisma.user.create({
    data: {
      name: "Sami Electric (سامي كهربائي)",
      email: "worker4@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker4@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  const wp4 = await prisma.workerProfile.create({
    data: {
      userId: worker4.id,
      status: WorkerStatus.APPROVED,
      bio: "تمديدات كهربائية ولوحات تحكم (Electrical installations and control panels)",
      currentRevision: 1,
      submittedRevision: 1,
      approvedRevision: 1,
      submittedAt: new Date(),
      decidedAt: new Date(),
      reviewedById: admin.id,
    },
  });

  await prisma.workerCategory.create({
    data: { workerProfileId: wp4.id, categoryId: catElectrical.id, experienceYears: 8 },
  });
  await prisma.workerServiceArea.create({
    data: { workerProfileId: wp4.id, areaId: area1.id },
  });

  await prisma.adminEvaluation.create({
    data: {
      workerProfileId: wp4.id,
      profileRevision: 1,
      categoryId: catElectrical.id,
      adminId: admin.id,
      score: 5,
      publicSummary: "فني كهرباء ممتاز (Excellent electrician)",
    },
  });

  // Worker 5: Pending Review
  const workerPending = await prisma.user.create({
    data: {
      name: "Zaid Pending (زيد قيد المراجعة)",
      email: "worker.pending@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker.pending@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  await prisma.workerProfile.create({
    data: {
      userId: workerPending.id,
      status: WorkerStatus.PENDING_REVIEW,
      bio: "فني تكييف وتبريد متقدم (HVAC technician awaiting review)",
      currentRevision: 1,
      submittedRevision: 1,
      submittedAt: new Date(),
    },
  });

  // Worker 6: Suspended Worker
  const workerSuspended = await prisma.user.create({
    data: {
      name: "Nader Suspended (نادر موقوف)",
      email: "worker.suspended@property.local",
      role: Role.WORKER,
      emailVerified: true,
      accounts: {
        create: {
          accountId: "worker.suspended@property.local",
          providerId: "credential",
          password: commonPassword,
        },
      },
    },
  });

  await prisma.workerProfile.create({
    data: {
      userId: workerSuspended.id,
      status: WorkerStatus.SUSPENDED,
      bio: "فني موقوف مؤقتاً (Temporarily suspended)",
      decisionReason: "Under administrative compliance review.",
    },
  });

  // ─── 8. Sample Maintenance Requests & Sourcing Cycles ───────────────────────
  // Task 1: Completed, Tenant-Confirmed, Closed, Feedback Given, Payment Recorded
  const req1 = await prisma.maintenanceRequest.create({
    data: {
      unitId: unit101.id,
      namedTenantId: tenant1.id,
      createdById: tenant1.id,
      categoryId: catPlumbing.id,
      title: "تسريب مياه تحت حوض المطبخ (Kitchen sink water leak)",
      description: "يوجد تسريب مياه مستمر من الأنبوب السفلي أسفل حوض الجلي بالمطبخ",
      urgency: Urgency.NORMAL,
      status: RequestStatus.CLOSED,
    },
  });

  const proc1 = await prisma.procurement.create({
    data: {
      requestId: req1.id,
      roundNumber: 1,
      mode: ProcurementMode.DIRECT,
      status: ProcurementStatus.AWARDED,
      directWorkerId: worker1.id,
      briefText: "إصلاح تسريب أنبوب حوض المطبخ واستبدال الوصلة المتضررة",
      awardedAt: new Date(),
    },
  });

  const offer1 = await prisma.offer.create({
    data: {
      procurementId: proc1.id,
      workerId: worker1.id,
      version: 1,
      amountAgorot: 12550, // 125.50 ILS
      currency: "ILS",
      scopeText: "فحص التسريب وتغيير الوصلة ومانع التسريب وتثبيت الأنبوب",
      status: OfferStatus.ACCEPTED,
    },
  });

  const wo1 = await prisma.workOrder.create({
    data: {
      requestId: req1.id,
      offerId: offer1.id,
      workerId: worker1.id,
      agreedAmountAgorot: 12550,
      agreedCurrency: "ILS",
      agreedScope: offer1.scopeText,
      offerVersion: 1,
      locationSnapshot: "Al-Noor Tower - Unit 101, Palestine St. 10",
      assignedAt: new Date(),
      startedAt: new Date(),
      startedById: worker1.id,
      completedAt: new Date(),
      completedById: worker1.id,
      completionNotes: "تم استبدال الوصلة التالفة واختبار ضغط المياه بدون أي تسريب",
      confirmedAt: new Date(),
      confirmedById: tenant1.id,
      closedAt: new Date(),
      closedById: owner1.id,
    },
  });

  // Payment Record: 125.50 ILS fully paid
  await prisma.paymentRecord.create({
    data: {
      workOrderId: wo1.id,
      recordedById: owner1.id,
      paidAgorot: 12550,
      lastPaymentDate: new Date(),
      lastPaymentRef: "CASH-REC-001",
      note: "تم تسليم المبلغ نقداً للعامل بعد اكتمال العمل وإغلاق البلاغ",
    },
  });

  // Tenant Feedback: 5 stars
  await prisma.tenantFeedback.create({
    data: {
      workOrderId: wo1.id,
      requestId: req1.id,
      tenantId: tenant1.id,
      workerId: worker1.id,
      rating: 5,
      comment: "عمل متقن جداً وسريع في الموعد، شكراً جزيلاً (Excellent work and on time!)",
    },
  });

  // Task 2: Public Tender with competing offers
  const req2 = await prisma.maintenanceRequest.create({
    data: {
      unitId: unit101.id,
      namedTenantId: tenant1.id,
      createdById: tenant1.id,
      categoryId: catPlumbing.id,
      title: "استبدال صنبور الحمام والمحبس الرئيسي (Bathroom faucet replacement)",
      description: "الصنبور القديم مكسور ويحتاج استبدال مع فحص المحبس",
      urgency: Urgency.LOW,
      status: RequestStatus.PROCUREMENT,
    },
  });

  const proc2 = await prisma.procurement.create({
    data: {
      requestId: req2.id,
      roundNumber: 1,
      mode: ProcurementMode.PUBLIC,
      status: ProcurementStatus.OPEN,
      briefText: "مناقصة لتوريد وتركيب صنبور حمام نوعية جيدة مع صمام أمان",
      budgetAgorot: 20000, // 200.00 ILS budget
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  });

  // Competing offers from Worker 1 and Worker 2
  await prisma.offer.create({
    data: {
      procurementId: proc2.id,
      workerId: worker1.id,
      version: 1,
      amountAgorot: 18000, // 180.00 ILS
      currency: "ILS",
      scopeText: "تركيب صنبور حمام إيطالي مع ضمان 6 شهور",
      status: OfferStatus.SUBMITTED,
    },
  });

  await prisma.offer.create({
    data: {
      procurementId: proc2.id,
      workerId: worker2.id,
      version: 1,
      amountAgorot: 15000, // 150.00 ILS
      currency: "ILS",
      scopeText: "استبدال الصنبور والمحبس وضبط ضغط المياه",
      status: OfferStatus.SUBMITTED,
    },
  });

  // Task 3: In Progress Job
  const req3 = await prisma.maintenanceRequest.create({
    data: {
      unitId: unit201.id,
      namedTenantId: tenant2.id,
      createdById: tenant2.id,
      categoryId: catElectrical.id,
      title: "انقطاع كهرباء في غرفة المعيشة (Living room electrical circuit trip)",
      description: "القاطع الكهربائي يفصل باستمرار عند تشغيل الإضاءة",
      urgency: Urgency.URGENT,
      status: RequestStatus.IN_PROGRESS,
    },
  });

  const proc3 = await prisma.procurement.create({
    data: {
      requestId: req3.id,
      roundNumber: 1,
      mode: ProcurementMode.DIRECT,
      status: ProcurementStatus.AWARDED,
      directWorkerId: worker4.id,
      awardedAt: new Date(),
    },
  });

  const offer3 = await prisma.offer.create({
    data: {
      procurementId: proc3.id,
      workerId: worker4.id,
      version: 1,
      amountAgorot: 9000, // 90.00 ILS
      currency: "ILS",
      scopeText: "فحص الدائرة الكهربائية واستبدال القاطع الفرعي",
      status: OfferStatus.ACCEPTED,
    },
  });

  await prisma.workOrder.create({
    data: {
      requestId: req3.id,
      offerId: offer3.id,
      workerId: worker4.id,
      agreedAmountAgorot: 9000,
      agreedCurrency: "ILS",
      agreedScope: offer3.scopeText,
      offerVersion: 1,
      locationSnapshot: "Al-Amal Complex - Unit 201, Northern Area",
      assignedAt: new Date(),
      startedAt: new Date(),
      startedById: worker4.id,
    },
  });

  console.log("✅ Seed completed successfully!");
  console.log("\nDemo Accounts:");
  console.log("-----------------------------------------------------------------");
  console.log("Super Admin: admin@property.local / Password123!");
  console.log("Owner 1:     owner1@property.local / Password123!");
  console.log("Owner 2:     owner2@property.local / Password123!");
  console.log("Tenant 1:    tenant1@property.local / Password123!");
  console.log("Tenant 2:    tenant2@property.local / Password123!");
  console.log("Tenant Pend: tenant.pending@property.local / Password123!");
  console.log("Worker 1:    worker1@property.local / Password123! (Plumber, Approved)");
  console.log("Worker 2:    worker2@property.local / Password123! (Plumber, Approved)");
  console.log("Worker 3:    worker3@property.local / Password123! (Plumber, Approved)");
  console.log("Worker 4:    worker4@property.local / Password123! (Electrician, Approved)");
  console.log("Worker Pend: worker.pending@property.local / Password123!");
  console.log("Worker Susp: worker.suspended@property.local / Password123!");
  console.log("Building Join Codes: NOOR2026, AMAL2026");
  console.log("-----------------------------------------------------------------");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
