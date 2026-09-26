import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role, RequestStatus } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";

export default async function TenantRequestsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.TENANT) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const tReq = await getTranslations("requestStatus");
  const isAr = locale === "ar";

  const requests = await prisma.maintenanceRequest.findMany({
    where: { namedTenantId: user.id },
    include: {
      unit: { include: { building: true } },
      category: true,
      workOrder: { include: { worker: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "بلاغاتي وطلبات الصيانة" : "My Maintenance Requests"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "سجل جميع البلاغات المرفوعة ومراحل متابعتها وتأكيدها" : "History and status of your maintenance tickets"}
          </p>
        </div>
        <Link
          href="/tenant/requests/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm w-fit"
        >
          <span>+</span>
          <span>{isAr ? "بلاغ عطل جديد" : "New Request"}</span>
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-3 rounded-2xl">
          <span className="text-3xl block">🔧</span>
          <p>{isAr ? "لم تقم برفع أي بلاغات صيانة حتى الآن." : "No maintenance requests submitted yet."}</p>
          <Link
            href="/tenant/requests/new"
            className="inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold"
          >
            {isAr ? "إبلاغ عن عطل الآن" : "Report an issue"}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const statusClass =
              request.status === "AWAITING_TENANT_CONFIRMATION" || request.status === "SUBMITTED"
                ? "badge-pending"
                : request.status === "IN_PROGRESS"
                ? "badge-in-progress"
                : request.status === "TENANT_CONFIRMED" || request.status === "CLOSED"
                ? "badge-completed"
                : "badge-muted";

            return (
              <div
                key={request.id}
                className="card-elevated p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/requests/${request.id}`}
                      className="font-bold text-base hover:text-teal-600 transition-colors"
                    >
                      {request.title}
                    </Link>
                    {request.urgency === "URGENT" && (
                      <span className="badge-status badge-urgent text-[10px]">
                        {isAr ? "🚨 طارئ" : "Urgent"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                    <span className="font-semibold text-foreground">
                      {request.unit.building.nameEn}
                    </span>
                    <span>·</span>
                    <span>
                      {request.unit.type === "SHOP" ? (isAr ? "محل" : "Shop") : (isAr ? "شقة" : "Unit")}{" "}
                      {request.unit.label}
                    </span>
                    <span>·</span>
                    <span>{isAr ? request.category.nameAr : request.category.nameEn}</span>
                    <span>·</span>
                    <span>
                      {new Date(request.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                    </span>
                    {request.workOrder && (
                      <>
                        <span>·</span>
                        <span className="text-teal-600 dark:text-teal-400 font-semibold">
                          {isAr ? "الفني:" : "Technician:"} {request.workOrder.worker.name}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge-status ${statusClass}`}>
                    {tReq(request.status as keyof typeof RequestStatus)}
                  </span>
                  <Link
                    href={`/requests/${request.id}`}
                    className="px-4 py-2 rounded-xl border border-line hover:border-teal-500/40 text-xs font-semibold hover:text-teal-600 transition-colors"
                  >
                    {isAr ? "عرض التفاصيل ←" : "View Details →"}
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
