import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role, RequestStatus } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";

export default async function AdminRequestsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.SUPER_ADMIN) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const tReq = await getTranslations("requestStatus");
  const isAr = locale === "ar";

  const requests = await prisma.maintenanceRequest.findMany({
    include: {
      unit: { include: { building: true } },
      category: true,
      namedTenant: { select: { name: true, email: true } },
      workOrder: { include: { worker: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "إدارة ومراقبة كافة بلاغات الصيانة" : "All Maintenance Tickets"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "نظرة رقابية شاملة على البلاغات عبر كافة المباني والملاك والفنيين" : "Platform-wide audit of all tickets, assignments, and statuses"}
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة الإدارة" : "← Admin Dashboard"}
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
          <span className="text-3xl block">📋</span>
          <p>{isAr ? "لا توجد بلاغات مسجلة في النظام حتى الآن." : "No maintenance tickets in the system yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((item) => {
            const statusClass =
              item.status === "AWAITING_TENANT_CONFIRMATION" || item.status === "SUBMITTED"
                ? "badge-pending"
                : item.status === "PROCUREMENT"
                ? "badge-procurement"
                : item.status === "IN_PROGRESS"
                ? "badge-in-progress"
                : item.status === "TENANT_CONFIRMED" || item.status === "CLOSED"
                ? "badge-completed"
                : "badge-muted";

            return (
              <div
                key={item.id}
                className="card-elevated p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/requests/${item.id}`}
                      className="font-bold text-base hover:text-teal-600 transition-colors"
                    >
                      {item.title}
                    </Link>
                    {item.urgency === "URGENT" && (
                      <span className="badge-status badge-urgent text-[10px]">
                        {isAr ? "🚨 طارئ" : "Urgent"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                    <span className="font-semibold text-foreground">
                      {item.unit.building.nameEn}
                    </span>
                    <span>·</span>
                    <span>
                      {item.unit.type === "SHOP" ? (isAr ? "محل" : "Shop") : (isAr ? "شقة" : "Unit")}{" "}
                      {item.unit.label}
                    </span>
                    <span>·</span>
                    <span>{isAr ? item.category.nameAr : item.category.nameEn}</span>
                    <span>·</span>
                    <span>
                      {isAr ? "المستأجر:" : "Tenant:"} {item.namedTenant.name}
                    </span>
                    <span>·</span>
                    <span className="text-teal-600 dark:text-teal-400 font-semibold">
                      {isAr ? "الفني:" : "Technician:"} {item.workOrder?.worker.name || (isAr ? "غير مكلف" : "Unassigned")}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge-status ${statusClass}`}>
                    {tReq(item.status as keyof typeof RequestStatus)}
                  </span>
                  <Link
                    href={`/requests/${item.id}`}
                    className="px-4 py-2 rounded-xl bg-surface-muted hover:bg-teal-500/10 border border-line text-xs font-semibold hover:text-teal-600 transition-colors"
                  >
                    {isAr ? "فحص البلاغ ←" : "Inspect →"}
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
