import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role, ProcurementStatus, WorkerStatus } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function WorkerOpportunitiesPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.WORKER) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const profile = await prisma.workerProfile.findUnique({
    where: { userId: user.id },
    include: { categories: true },
  });

  const isApproved = profile?.status === WorkerStatus.APPROVED;
  const isAr = locale === "ar";
  const approvedCategoryIds = profile?.categories.map((c) => c.categoryId) ?? [];

  const opportunities = isApproved
    ? await prisma.procurement.findMany({
        where: {
          status: ProcurementStatus.OPEN,
          offers: { none: { workerId: user.id } },
          request: { categoryId: { in: approvedCategoryIds } },
          OR: [
            { mode: "PUBLIC" },
            { mode: "DIRECT", directWorkerId: user.id },
            { mode: "INVITED", invitations: { some: { workerId: user.id } } },
          ],
        },
        include: {
          request: {
            include: {
              unit: { include: { building: true } },
              category: true,
            },
          },
        },
        orderBy: { openedAt: "desc" },
      })
    : [];

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "الفرص والمناقصات المتاحة" : "Available Opportunities & Tenders"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "طلبات الصيانة والمناقصات المفتوحة التي يمكنك تقديم عروض أسعار عليها"
              : "Open maintenance jobs where you can submit competitive quotes"}
          </p>
        </div>
        <Link
          href="/worker/offers"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "عرض عروضي المقدمة ←" : "View my submitted offers →"}
        </Link>
      </div>

      {/* Verification Notice */}
      {!isApproved && (
        <div className="card-elevated p-6 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <h3 className="font-bold text-base text-amber-900 dark:text-amber-200">
                {profile?.status === WorkerStatus.PENDING_REVIEW
                  ? (isAr ? "ملفك المهني قيد المراجعة والتقييم من إدارة النظام" : "Your profile is pending admin evaluation")
                  : (isAr ? "يجب اعتماد ملفك المهني قبل التقديم على المناقصات" : "Your profile must be approved to submit quotes")}
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                {isAr
                  ? "يرجى استكمال التخصصات وسنوات الخبرة والشهادات لتمكينك من استلام الفرص ومنافسة الفنيين."
                  : "Please complete your specialties, years of experience, and credentials to be verified."}
              </p>
            </div>
          </div>
          <div>
            <Link
              href="/worker/profile"
              className="inline-block px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs"
            >
              {isAr ? "إدارة الملف والاعتماد المهني ←" : "Manage Profile & Credentials →"}
            </Link>
          </div>
        </div>
      )}

      {isApproved && opportunities.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
          <span className="text-3xl block">🔍</span>
          <p>{isAr ? "لا توجد فرص جديدة مفتوحة بانتظار عروض أسعار حالياً." : "No new open opportunities available right now."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => (
            <div
              key={opp.id}
              className="card-elevated p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/requests/${opp.requestId}`}
                    className="font-bold text-base hover:text-teal-600 transition-colors"
                  >
                    {opp.request.title}
                  </Link>
                  <span className="badge-status badge-procurement text-[10px]">
                    {opp.mode === "DIRECT"
                      ? (isAr ? "عرض مباشر" : "Direct Request")
                      : opp.mode === "INVITED"
                      ? (isAr ? "مناقصة بدعوة" : "Invited Tender")
                      : (isAr ? "مناقصة عامة" : "Public Tender")}
                  </span>
                  {opp.request.urgency === "URGENT" && (
                    <span className="badge-status badge-urgent text-[10px]">
                      {isAr ? "🚨 طارئ" : "Urgent"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                  <span className="font-semibold text-foreground">
                    {opp.request.unit.building.nameEn}
                  </span>
                  <span>·</span>
                  <span>{isAr ? opp.request.category.nameAr : opp.request.category.nameEn}</span>
                  {opp.budgetAgorot && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {isAr ? "الميزانية المتوقعة:" : "Budget:"} {(opp.budgetAgorot / 100).toFixed(2)} {isAr ? "شيكل" : "ILS"}
                      </span>
                    </>
                  )}
                  {opp.deadline && (
                    <>
                      <span>·</span>
                      <span>
                        {isAr ? "آخر موعد للعروض:" : "Deadline:"} {new Date(opp.deadline).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                      </span>
                    </>
                  )}
                </p>
                {opp.briefText && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-surface-muted/40 p-2.5 rounded-lg border border-line/50 mt-1">
                    {opp.briefText}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Link
                  href={`/requests/${opp.requestId}`}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  {isAr ? "تقديم عرض سعر ←" : "Submit Quote →"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
