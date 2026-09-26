import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function WorkerJobsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.WORKER && user.role !== Role.SUPER_ADMIN)) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const jobs = await prisma.workOrder.findMany({
    where: user.role === Role.SUPER_ADMIN ? undefined : { workerId: user.id },
    include: {
      request: {
        include: {
          unit: { include: { building: true } },
          category: true,
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "مهامي الحالية والسابقة" : "My Assigned Work Orders"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "جميع مهام الصيانة المسندة إليك ومتابعة مراحل تنفيذها وإثبات إنجازها"
              : "Track all work orders awarded to you, from execution to tenant sign-off"}
          </p>
        </div>
        <Link
          href="/worker/opportunities"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "+ البحث عن فرص جديدة" : "+ Find opportunities"}
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-3 rounded-2xl">
          <span className="text-3xl block">🔨</span>
          <p>{isAr ? "لا توجد مهام صيانة مسندة إليك حالياً." : "No assigned jobs at the moment."}</p>
          <Link
            href="/worker/opportunities"
            className="inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold"
          >
            {isAr ? "تصفح الفرص والمناقصات" : "Browse Opportunities"}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const statusClass =
              job.request.status === "AWAITING_TENANT_CONFIRMATION"
                ? "badge-pending"
                : job.request.status === "IN_PROGRESS"
                ? "badge-in-progress"
                : job.request.status === "TENANT_CONFIRMED" || job.request.status === "CLOSED"
                ? "badge-completed"
                : "badge-muted";

            return (
              <div
                key={job.id}
                className="card-elevated p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/requests/${job.requestId}`}
                      className="font-bold text-base hover:text-teal-600 transition-colors"
                    >
                      {job.request.title}
                    </Link>
                    {job.request.urgency === "URGENT" && (
                      <span className="badge-status badge-urgent text-[10px]">
                        {isAr ? "🚨 طارئ" : "Urgent"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                    <span className="font-semibold text-foreground">
                      {job.request.unit.building.nameEn}
                    </span>
                    <span>·</span>
                    <span>وحدة {job.request.unit.label}</span>
                    <span>·</span>
                    <span>{isAr ? job.request.category.nameAr : job.request.category.nameEn}</span>
                    <span>·</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {isAr ? "المبلغ المتفق عليه:" : "Agreed:"} {(job.agreedAmountAgorot / 100).toFixed(2)} {isAr ? "شيكل" : "ILS"}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge-status ${statusClass}`}>
                    {job.request.status}
                  </span>
                  <Link
                    href={`/requests/${job.requestId}`}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
                  >
                    {isAr ? "متابعة التنفيذ ←" : "Execute Job →"}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
