import { getCurrentUser } from "@/server/auth/actions";
import { getRequestDetails, acceptRequestForProcurement, addComment } from "@/server/services/requests";
import { createProcurementRound, submitOrReviseOffer, acceptOfferAndAward } from "@/server/services/procurement";
import { startWork, reportCompletion, confirmExecution, requestRework, closeTask } from "@/server/services/jobs";
import { recordExternalPayment, formatIls } from "@/server/services/payments";
import { submitTenantFeedback } from "@/server/services/feedback";
import { searchApprovedWorkers } from "@/server/services/workers";
import { redirect } from "@/i18n/routing";
import { revalidatePath } from "next/cache";
import { RequestStatus, Audience, Role, ProcurementMode, MaintenanceRequest, Unit, Building, ServiceCategory, WorkOrder, User } from "@prisma/client";
import { Link } from "@/i18n/routing";

type FullRequest = MaintenanceRequest & {
  unit: Unit & { building: Building };
  category: ServiceCategory;
  namedTenant: Pick<User, "id" | "name" | "email">;
  workOrder: (WorkOrder & {
    worker: Pick<User, "id" | "name" | "email">;
    feedback?: { rating: number; comment?: string | null } | null;
    paymentRecord?: { paidAgorot: number; lastPaymentRef?: string | null; note?: string | null } | null;
  }) | null;
  procurements: Array<{
    id: string;
    mode: ProcurementMode;
    status: string;
    briefText?: string | null;
    budgetAgorot?: number | null;
    deadline?: Date | null;
    offers: Array<{
      id: string;
      version: number;
      amountAgorot: number;
      scopeText?: string | null;
      worker: Pick<User, "id" | "name" | "email">;
    }>;
  }>;
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: Pick<User, "id" | "name" | "role">;
  }>;
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  let request: FullRequest;
  try {
    request = (await getRequestDetails(user, id)) as unknown as FullRequest;
  } catch {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-rose-600 dark:text-rose-400">
          غير مصرح بالوصول أو أن البلاغ غير موجود
        </h2>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold"
        >
          العودة للوحة التحكم
        </Link>
      </div>
    );
  }

  const isAr = locale === "ar";
  const isOwner = user.role === Role.OWNER || user.role === Role.SUPER_ADMIN;
  const isTenant = request.namedTenantId === user.id;
  const isAssignedWorker = request.workOrder?.workerId === user.id;
  const activeProcurement = request.procurements?.find(
    (p) => p.status === "OPEN" || p.status === "DRAFT"
  );

  // Fetch approved workers for direct sourcing if owner is setting up procurement
  const approvedWorkers =
    isOwner && request.status === RequestStatus.PROCUREMENT
      ? await searchApprovedWorkers(user, { categoryId: request.categoryId })
      : [];

  // ─── Server Actions ────────────────────────────────────────────────────────
  async function handleAcceptForSourcing() {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    await acceptRequestForProcurement(cu, id);
    revalidatePath(`/${locale}/requests/${id}`);
    revalidatePath("/[locale]/requests/[id]", "page");
  }

  async function handleOpenDirectSourcing(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const workerId = formData.get("workerId") as string;
    const brief = formData.get("brief") as string;

    if (workerId) {
      await createProcurementRound(cu, id, {
        mode: ProcurementMode.DIRECT,
        directWorkerId: workerId,
        briefText: brief || undefined,
      });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleOpenPublicTender(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const brief = formData.get("brief") as string;
    const days = parseInt(formData.get("days") as string, 10) || 7;
    const budget = parseFloat(formData.get("budget") as string);

    await createProcurementRound(cu, id, {
      mode: ProcurementMode.PUBLIC,
      briefText: brief || undefined,
      budgetAgorot: budget ? Math.round(budget * 100) : undefined,
      deadline: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    });
    revalidatePath(`/${locale}/requests/${id}`);
    revalidatePath("/[locale]/requests/[id]", "page");
  }

  async function handleSubmitQuote(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu || !activeProcurement) return;
    const amountIls = parseFloat(formData.get("amount") as string);
    const scope = formData.get("scope") as string;

    if (amountIls > 0) {
      await submitOrReviseOffer(cu, activeProcurement.id, {
        amountAgorot: Math.round(amountIls * 100),
        scopeText: scope,
      });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleAwardOffer(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const offerId = formData.get("offerId") as string;
    const version = parseInt(formData.get("version") as string, 10);

    if (offerId && version) {
      await acceptOfferAndAward(cu, offerId, version);
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleStartWork() {
    "use server";
    const cu = await getCurrentUser();
    if (!cu || !request.workOrder) return;
    await startWork(cu, request.workOrder.id);
    revalidatePath(`/${locale}/requests/${id}`);
    revalidatePath("/[locale]/requests/[id]", "page");
  }

  async function handleReportDone(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu || !request.workOrder) return;
    const notes = formData.get("notes") as string;
    if (notes) {
      await reportCompletion(cu, request.workOrder.id, { completionNotes: notes });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleTenantConfirm() {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    await confirmExecution(cu, id);
    revalidatePath(`/${locale}/requests/${id}`);
    revalidatePath("/[locale]/requests/[id]", "page");
  }

  async function handleTenantRework(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const reason = formData.get("reason") as string;
    if (reason) {
      await requestRework(cu, id, reason);
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleOwnerClose() {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    await closeTask(cu, id);
    revalidatePath(`/${locale}/requests/${id}`);
    revalidatePath("/[locale]/requests/[id]", "page");
  }

  async function handleRecordPayment(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu || !request.workOrder) return;
    const paidIls = parseFloat(formData.get("paidAmount") as string);
    const ref = formData.get("ref") as string;
    const note = formData.get("note") as string;

    if (!isNaN(paidIls)) {
      await recordExternalPayment(cu, request.workOrder.id, {
        cumulativePaidAgorot: Math.round(paidIls * 100),
        reference: ref || undefined,
        note: note || undefined,
      });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleAddComment(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const content = formData.get("content") as string;
    const audience =
      (formData.get("audience") as Audience) ||
      (cu.role === Role.WORKER ? Audience.JOB_PARTICIPANTS : Audience.TENANT_OWNER);

    if (content) {
      await addComment(cu, id, { content, audience });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  async function handleFeedback(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu || !request.workOrder) return;
    const rating = parseInt(formData.get("rating") as string, 10);
    const comment = formData.get("comment") as string;

    if (rating >= 1 && rating <= 5) {
      await submitTenantFeedback(cu, request.workOrder.id, { rating, comment });
      revalidatePath(`/${locale}/requests/${id}`);
      revalidatePath("/[locale]/requests/[id]", "page");
    }
  }

  const statusClass =
    request.status === "AWAITING_TENANT_CONFIRMATION" || request.status === "SUBMITTED"
      ? "badge-pending"
      : request.status === "PROCUREMENT"
      ? "badge-procurement"
      : request.status === "IN_PROGRESS"
      ? "badge-in-progress"
      : request.status === "TENANT_CONFIRMED" || request.status === "CLOSED"
      ? "badge-completed"
      : "badge-muted";

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header card */}
      <div className="card-elevated p-6 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`badge-status ${statusClass}`}>
              {request.status}
            </span>
            <span className="text-xs px-2.5 py-0.5 border border-line rounded-lg text-zinc-600 dark:text-zinc-300">
              {isAr ? request.category.nameAr : request.category.nameEn}
            </span>
            {request.urgency === "URGENT" && (
              <span className="badge-status badge-urgent text-xs">
                {isAr ? "🚨 طارئ" : "Urgent"}
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {new Date(request.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{request.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-line bg-surface-muted/30 p-4 rounded-xl border border-line/60">
          {request.description}
        </p>

        <div className="pt-3 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="block text-zinc-400 mb-0.5">{isAr ? "المبنى والوحدة:" : "Building & Unit:"}</span>
            <span className="font-semibold text-foreground">
              {request.unit.building.nameEn} · وحدة {request.unit.label}
            </span>
          </div>
          <div>
            <span className="block text-zinc-400 mb-0.5">{isAr ? "المستأجر المعني:" : "Tenant:"}</span>
            <span className="font-semibold text-foreground">{request.namedTenant.name}</span>
          </div>
          {request.workOrder && (
            <div>
              <span className="block text-zinc-400 mb-0.5">{isAr ? "الفني المعين:" : "Assigned Worker:"}</span>
              <span className="font-semibold text-teal-600 dark:text-teal-400">
                {request.workOrder.worker.name}
              </span>
            </div>
          )}
          {request.workOrder?.agreedAmountAgorot && isOwner && (
            <div>
              <span className="block text-zinc-400 mb-0.5">{isAr ? "المبلغ المتفق عليه:" : "Agreed Amount:"}</span>
              <span className="font-bold text-foreground">
                {formatIls(request.workOrder.agreedAmountAgorot)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── ACTION STAGE PANELS ────────────────────────────────────────── */}

      {/* 1. Stage: SUBMITTED -> Owner can accept for sourcing */}
      {request.status === RequestStatus.SUBMITTED && isOwner && (
        <div className="card-elevated p-6 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 space-y-3">
          <h3 className="font-bold text-base text-amber-900 dark:text-amber-200">
            {isAr ? "البلاغ بانتظار موافقتك كصاحب عقار لبدء استدراج عروض الأسعار" : "Pending Owner Acceptance for Sourcing"}
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {isAr
              ? "عند قبول البلاغ، ستتمكن من فتح طلب عرض سعر مباشر من فني معتمد أو فتح مناقصة عامة."
              : "Accept this request to initiate direct price quotes or public tenders."}
          </p>
          <div className="pt-1">
            <form action={handleAcceptForSourcing}>
              <button
                type="submit"
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {isAr ? "قبول البلاغ والبدء في استدراج العروض ←" : "Accept for Procurement →"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Stage: PROCUREMENT -> Sourcing & Offers */}
      {request.status === RequestStatus.PROCUREMENT && (
        <div className="card-elevated p-6 rounded-2xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
              {isAr ? "مرحلة استدراج عروض الأسعار والمناقصة" : "Procurement & Bidding Round"}
            </h3>
            {activeProcurement && (
              <span className="badge-status badge-procurement text-xs">
                {activeProcurement.mode === "DIRECT" ? (isAr ? "عرض مباشر" : "Direct Quote") : (isAr ? "مناقصة عامة" : "Public Tender")}
              </span>
            )}
          </div>

          {/* Owner can create a round if none is active */}
          {!activeProcurement && isOwner && (
            <div className="space-y-4 pt-2">
              <span className="text-xs font-bold text-zinc-400 block uppercase tracking-wider">
                {isAr ? "اختر آلية استدراج العروض:" : "Choose Sourcing Method:"}
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Direct Quote Form */}
                <form action={handleOpenDirectSourcing} className="p-4 border border-line rounded-xl bg-surface-muted/50 space-y-3">
                  <h4 className="font-bold text-xs text-foreground">
                    {isAr ? "1. طلب عرض سعر مباشر من فني معتمد" : "1. Direct Quote from Approved Worker"}
                  </h4>
                  <select
                    name="workerId"
                    required
                    className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
                  >
                    <option value="">{isAr ? "-- اختر فني معتمد --" : "-- Choose Approved Technician --"}</option>
                    {approvedWorkers.map((w) => (
                      <option key={w.userId} value={w.userId}>
                        {w.user.name} ({w.categories[0]?.experienceYears || 0} {isAr ? "سنوات خبرة" : "yrs exp"})
                      </option>
                    ))}
                  </select>
                  <input
                    name="brief"
                    placeholder={isAr ? "ملاحظات مختصرة للفني (اختياري)" : "Notes for technician (optional)"}
                    className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isAr ? "إرسال طلب مباشر للفني" : "Send Direct Quote Request"}
                  </button>
                </form>

                {/* Public Tender Form */}
                <form action={handleOpenPublicTender} className="p-4 border border-line rounded-xl bg-surface-muted/50 space-y-3">
                  <h4 className="font-bold text-xs text-foreground">
                    {isAr ? "2. فتح مناقصة عامة لجميع الفنيين المعتمدين" : "2. Launch Competitive Public Tender"}
                  </h4>
                  <input
                    name="budget"
                    type="number"
                    step="0.01"
                    placeholder={isAr ? "الميزانية التقديرية بالشيكل (اختياري)" : "Estimated Budget in ILS (optional)"}
                    className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
                  />
                  <input
                    name="brief"
                    placeholder={isAr ? "شروط ومتطلبات المناقصة" : "Tender scope & conditions"}
                    className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isAr ? "نشر المناقصة العامة" : "Publish Public Tender"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Worker can submit offer if procurement is active */}
          {activeProcurement && user.role === Role.WORKER && (
            <div className="p-5 bg-teal-500/10 border border-teal-500/20 rounded-xl space-y-3">
              <h4 className="font-bold text-sm text-teal-800 dark:text-teal-200">
                {isAr ? "تقديم عرض السعر الخاص بك" : "Submit Your Price Quote"}
              </h4>
              <form action={handleSubmitQuote} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                      {isAr ? "المبلغ الإجمالي بالشيكل (ILS)" : "Total Amount in ILS"}
                    </label>
                    <input
                      name="amount"
                      type="number"
                      step="0.50"
                      required
                      placeholder="مثال: 125.50"
                      className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                      {isAr ? "تفاصيل ونطاق العمل والضمان" : "Scope & Warranty Details"}
                    </label>
                    <input
                      name="scope"
                      required
                      placeholder={isAr ? "مثال: استبدال القطع وضمان لمدة شهرين" : "Scope of work and warranty"}
                      className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {isAr ? "إرسال عرض السعر" : "Submit Quote"}
                </button>
              </form>
            </div>
          )}

          {/* Owner Offer Comparison */}
          {activeProcurement && isOwner && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                {isAr ? `العروض المقدمة (${activeProcurement.offers?.length || 0}):` : `Submitted Quotes (${activeProcurement.offers?.length || 0}):`}
              </span>
              {activeProcurement.offers?.length === 0 ? (
                <p className="text-xs text-zinc-400 py-4 text-center">
                  {isAr ? "بانتظار تقديم عروض الأسعار من الفنيين..." : "Awaiting technician quotes..."}
                </p>
              ) : (
                <div className="space-y-2">
                  {activeProcurement.offers?.map((offer) => (
                    <div
                      key={offer.id}
                      className="p-4 border border-line rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-muted/40"
                    >
                      <div>
                        <div className="font-bold text-sm text-foreground">
                          {offer.worker.name} —{" "}
                          <span className="text-teal-600 dark:text-teal-400 font-extrabold">
                            {formatIls(offer.amountAgorot)}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {offer.scopeText || (isAr ? "بدون تفاصيل إضافية" : "No scope details")}
                        </div>
                      </div>
                      <form action={handleAwardOffer}>
                        <input type="hidden" name="offerId" value={offer.id} />
                        <input type="hidden" name="version" value={offer.version} />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          {isAr ? "قبول هذا العرض وتكليف الفني" : "Award Offer"}
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Stage: ASSIGNED -> Worker Starts */}
      {request.status === RequestStatus.ASSIGNED && isAssignedWorker && (
        <div className="card-elevated p-6 rounded-2xl border-teal-500/30 bg-teal-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-base text-teal-800 dark:text-teal-200">
              {isAr ? "تم تكليفك بالمهمة بنجاح!" : "You have been awarded this work order!"}
            </h4>
            <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
              {isAr
                ? "اضغط على زر بدء العمل عند توجهك لمقر العميل للشروع في أعمال الصيانة."
                : "Click Start Work when you arrive on site to start the maintenance."}
            </p>
          </div>
          <form action={handleStartWork}>
            <button
              type="submit"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              {isAr ? "بدء العمل الآن 🔨" : "Start Work 🔨"}
            </button>
          </form>
        </div>
      )}

      {/* 4. Stage: IN_PROGRESS -> Worker Reports Completion */}
      {request.status === RequestStatus.IN_PROGRESS && isAssignedWorker && (
        <div className="card-elevated p-6 rounded-2xl space-y-3">
          <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {isAr ? "الإبلاغ عن انتهاء أعمال الصيانة" : "Report Work Completion"}
          </h4>
          <p className="text-xs text-zinc-500">
            {isAr
              ? "اكتب ملخصاً لما تم تنفيذه ليقوم المستأجر بفحصه وتأكيد الإنجاز."
              : "Summarize the repair work completed so the tenant can inspect and verify."}
          </p>
          <form action={handleReportDone} className="space-y-3">
            <textarea
              name="notes"
              required
              rows={3}
              placeholder={isAr ? "اكتب تفاصيل ما قمت بإنجازه هنا..." : "Describe what was completed..."}
              className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isAr ? "إعلان انتهاء العمل وإرساله للمستأجر" : "Submit Completion for Tenant Verification"}
            </button>
          </form>
        </div>
      )}

      {/* 5. Stage: AWAITING_TENANT_CONFIRMATION -> Tenant Confirms OR Requests Rework */}
      {request.status === RequestStatus.AWAITING_TENANT_CONFIRMATION && isTenant && (
        <div className="card-elevated p-6 rounded-2xl border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/20 space-y-4">
          <div>
            <h4 className="font-bold text-base text-blue-900 dark:text-blue-200">
              {isAr ? "أعلن الفني انتهاء أعمال الصيانة! يرجى الفحص والتأكيد" : "Technician Reported Job Complete! Please inspect & confirm"}
            </h4>
            {request.workOrder?.completionNotes && (
              <div className="p-3 bg-surface rounded-xl border border-line mt-2 text-xs">
                <span className="font-bold block text-zinc-400 mb-1">{isAr ? "ملاحظات الفني:" : "Technician Notes:"}</span>
                <p className="text-foreground">{request.workOrder.completionNotes}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center pt-2">
            <form action={handleTenantConfirm}>
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {isAr ? "✅ تأكيد إنجاز العمل بنجاح" : "✅ Confirm Satisfactory Completion"}
              </button>
            </form>

            <form action={handleTenantRework} className="flex gap-2 items-center flex-1 max-w-md">
              <input
                name="reason"
                required
                placeholder={isAr ? "سبب طلب إعادة العمل أو الملاحظات..." : "Reason for rework..."}
                className="flex-1 px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap shadow-xs transition-colors cursor-pointer"
              >
                {isAr ? "طلب إعادة عمل" : "Request Rework"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. Stage: TENANT_CONFIRMED -> Owner Closes Task */}
      {request.status === RequestStatus.TENANT_CONFIRMED && isOwner && (
        <div className="card-elevated p-6 rounded-2xl border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-bold text-base text-emerald-800 dark:text-emerald-200">
              {isAr ? "أكّد المستأجر إنجاز العمل بنجاح!" : "Tenant confirmed completion!"}
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              {isAr ? "يمكنك الآن إغلاق المهمة رسمياً ومتابعة تسجيل الدفعات المالية." : "You can now officially close the ticket and record payments."}
            </p>
          </div>
          <form action={handleOwnerClose}>
            <button
              type="submit"
              className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              {isAr ? "إغلاق المهمة رسمياً 🔒" : "Close Ticket 🔒"}
            </button>
          </form>
        </div>
      )}

      {/* 7. Tenant Feedback */}
      {(request.status === RequestStatus.TENANT_CONFIRMED || request.status === RequestStatus.CLOSED) &&
        isTenant &&
        !request.workOrder?.feedback && (
          <div className="card-elevated p-6 rounded-2xl space-y-3">
            <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
              {isAr ? "تقييم أداء الفني (Tenant Feedback)" : "Rate Technician Performance"}
            </h4>
            <form action={handleFeedback} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-zinc-400">{isAr ? "التقييم:" : "Rating:"}</span>
                <select
                  name="rating"
                  defaultValue="5"
                  className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground font-semibold"
                >
                  <option value="5">⭐⭐⭐⭐⭐ {isAr ? "ممتاز (5)" : "Excellent (5)"}</option>
                  <option value="4">⭐⭐⭐⭐ {isAr ? "جيد جداً (4)" : "Very Good (4)"}</option>
                  <option value="3">⭐⭐⭐ {isAr ? "متوسط (3)" : "Average (3)"}</option>
                  <option value="2">⭐⭐ {isAr ? "مقبول (2)" : "Fair (2)"}</option>
                  <option value="1">⭐ {isAr ? "ضعيف (1)" : "Poor (1)"}</option>
                </select>
              </div>
              <input
                name="comment"
                placeholder={isAr ? "تعليقك على الخدمة وجودة العمل (اختياري)" : "Your comments on service quality (optional)"}
                className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {isAr ? "إرسال التقييم" : "Submit Review"}
              </button>
            </form>
          </div>
        )}

      {/* 8. Owner Payment Record */}
      {request.workOrder && isOwner && (
        <div className="card-elevated p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
              {isAr ? "سجل الدفعات النقدية الخارجية (ILS)" : "External Payment Ledger (ILS)"}
            </h4>
            <span className="badge-status badge-completed text-xs font-bold">
              {isAr ? "المتفق عليه:" : "Agreed:"} {formatIls(request.workOrder.agreedAmountAgorot)}
            </span>
          </div>

          <form action={handleRecordPayment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                {isAr ? "المبلغ المدفوع تراكمياً (شيكل)" : "Cumulative Paid (ILS)"}
              </label>
              <input
                name="paidAmount"
                type="number"
                step="0.5"
                required
                defaultValue={((request.workOrder.paymentRecord?.paidAgorot || 0) / 100).toFixed(2)}
                className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                {isAr ? "رقم الإيصال / المرجع" : "Receipt / Reference"}
              </label>
              <input
                name="ref"
                placeholder="CASH-001"
                defaultValue={request.workOrder.paymentRecord?.lastPaymentRef || ""}
                className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                {isAr ? "ملاحظة الدفع" : "Payment Note"}
              </label>
              <input
                name="note"
                placeholder={isAr ? "دفعة أولى أو تسليم نقدي" : "Payment note"}
                defaultValue={request.workOrder.paymentRecord?.note || ""}
                className="w-full px-3 py-2 text-xs border border-line rounded-lg bg-surface text-foreground"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {isAr ? "تحديث سجل الدفع" : "Update Payment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Comments & Discussion Section ──────────────────────────────── */}
      <div className="card-elevated p-6 rounded-2xl space-y-4">
        <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
          {isAr ? "المحادثة والتعليقات على البلاغ" : "Ticket Discussion & Timeline"}
        </h3>

        {/* Comment list */}
        <div className="space-y-3">
          {request.comments.length === 0 ? (
            <p className="text-xs text-zinc-400 py-4 text-center">
              {isAr ? "لا توجد تعليقات بعد." : "No comments yet."}
            </p>
          ) : (
            request.comments.map((c) => (
              <div
                key={c.id}
                className="p-3.5 border border-line rounded-xl bg-surface-muted/40 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-foreground">
                    {c.author.name}{" "}
                    <span className="font-normal text-zinc-400">({c.author.role})</span>
                  </span>
                  <span className="text-zinc-400 font-mono">
                    {new Date(c.createdAt).toLocaleTimeString(isAr ? "ar-EG" : "en-US")}
                  </span>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{c.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Add comment form */}
        <form action={handleAddComment} className="space-y-3 pt-3 border-t border-line">
          <textarea
            name="content"
            required
            rows={2}
            placeholder={isAr ? "اكتب تعليقاً هنا..." : "Write a comment..."}
            className="w-full px-3 py-2 text-xs border border-line rounded-xl bg-surface text-foreground focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex items-center justify-between gap-3">
            {isOwner && (
              <select
                name="audience"
                className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground"
              >
                <option value="TENANT_OWNER">{isAr ? "المستأجر وصاحب العقار فقط" : "Tenant & Owner only"}</option>
                <option value="JOB_PARTICIPANTS">{isAr ? "جميع الأطراف (بما فيهم الفني)" : "All parties (including worker)"}</option>
              </select>
            )}
            <button
              type="submit"
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer ml-auto"
            >
              {isAr ? "إرسال تعليق" : "Send Comment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
