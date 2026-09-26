import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role, RequestStatus } from "@prisma/client";
import { getLocale, getTranslations } from "next-intl/server";

export default async function OwnerRequestsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.OWNER && user.role !== Role.SUPER_ADMIN)) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const tReq = await getTranslations("requestStatus");
  const isAr = locale === "ar";

  const requests = await prisma.maintenanceRequest.findMany({
    where: user.role === Role.SUPER_ADMIN ? undefined : { unit: { building: { ownerId: user.id } } },
    include: {
      unit: { include: { building: true } },
      category: true,
      namedTenant: { select: { name: true } },
      workOrder: { include: { worker: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "بلاغات وطلبات الصيانة" : "Maintenance Requests"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "متابعة وإدارة كافة البلاغات الواردة من المستأجرين في عقاراتك" : "Monitor and manage incoming fault reports from tenants"}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة التحكم" : "← Back to Dashboard"}
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
          <span className="text-3xl block">📋</span>
          <p>{isAr ? "لا توجد بلاغات صيانة حالياً في عقاراتك." : "No maintenance requests found."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
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
                      {isAr ? "المستأجر:" : "Tenant:"} {request.namedTenant.name}
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
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-colors"
                  >
                    {isAr ? "إدارة البلاغ ←" : "Manage →"}
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
