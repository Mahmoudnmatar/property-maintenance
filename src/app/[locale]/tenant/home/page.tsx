import { getCurrentUser } from "@/server/auth/actions";
import { redirect, Link } from "@/i18n/routing";
import { prisma } from "@/server/db";
import { getTranslations, getLocale } from "next-intl/server";
import { Role, RequestStatus, MembershipStatus } from "@prisma/client";

export default async function TenantHomePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.TENANT) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const t = await getTranslations("common");
  const tReq = await getTranslations("requestStatus");
  const isAr = locale === "ar";

  // Active tenancy with building, unit, and owner details
  const activeTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, endedAt: null },
    include: {
      unit: {
        include: {
          building: {
            include: {
              owner: {
                select: { name: true, email: true },
              },
            },
          },
        },
      },
    },
  });

  // Pending membership request if not active
  const pendingRequest = !activeTenancy
    ? await prisma.membershipRequest.findFirst({
        where: { tenantId: user.id, status: MembershipStatus.PENDING },
        include: { unit: { include: { building: true } } },
      })
    : null;

  // Recent maintenance requests submitted by this tenant
  const requests = await prisma.maintenanceRequest.findMany({
    where: { namedTenantId: user.id },
    include: {
      unit: { include: { building: true } },
      category: true,
      workOrder: { include: { worker: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const awaitingConfirmation = requests.filter(
    (r) => r.status === RequestStatus.AWAITING_TENANT_CONFIRMATION
  );

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "وحدتي السكنية وبلاغاتي" : "My Residence & Requests"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? `أهلاً بك، ${user.name}` : `Welcome back, ${user.name}`}
          </p>
        </div>
        {activeTenancy && (
          <Link
            href="/tenant/requests/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm w-fit"
          >
            <span>+</span>
            <span>{isAr ? "إبلاغ عن عطل جديد" : "New Maintenance Request"}</span>
          </Link>
        )}
      </div>

      {/* Tenancy Overview Card */}
      {activeTenancy ? (
        <div className="card-elevated p-6 rounded-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="badge-status badge-completed text-xs font-semibold">
                {isAr ? "عقد ساري ومؤكد" : "Active Tenancy"}
              </span>
              <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-50 mt-2">
                {activeTenancy.unit.building.nameAr || activeTenancy.unit.building.nameEn}
                <span className="text-sm font-normal text-zinc-400 mx-2">
                  ({activeTenancy.unit.building.nameEn})
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1">
                <span>📍</span>
                <span>{activeTenancy.unit.building.address}</span>
              </p>
            </div>

            <div className="flex flex-col sm:items-end gap-1 text-xs">
              <span className="text-zinc-400">{isAr ? "صاحب العقار:" : "Property Owner:"}</span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">
                {activeTenancy.unit.building.owner.name}
              </span>
              <span className="text-zinc-500 font-mono" dir="ltr">
                {activeTenancy.unit.building.owner.email}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-line text-xs">
            <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
              <span className="text-zinc-400 block mb-1">{isAr ? "رقم / اسم الوحدة" : "Unit Label"}</span>
              <span className="font-bold text-sm text-foreground">
                {activeTenancy.unit.type === "SHOP" ? (isAr ? "محل" : "Shop") : (isAr ? "شقة" : "Apartment")}{" "}
                {activeTenancy.unit.label}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
              <span className="text-zinc-400 block mb-1">{isAr ? "الطابق" : "Floor"}</span>
              <span className="font-bold text-sm text-foreground">
                {activeTenancy.unit.floor || (isAr ? "غير محدد" : "N/A")}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
              <span className="text-zinc-400 block mb-1">{isAr ? "تاريخ بدء السكن" : "Started At"}</span>
              <span className="font-bold text-sm text-foreground font-mono">
                {new Date(activeTenancy.startedAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
              <span className="text-zinc-400 block mb-1">{isAr ? "إجمالي البلاغات" : "Total Requests"}</span>
              <span className="font-bold text-sm text-teal-600 dark:text-teal-400">
                {requests.length} {isAr ? "بلاغ" : "requests"}
              </span>
            </div>
          </div>
        </div>
      ) : pendingRequest ? (
        <div className="card-elevated p-6 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">⏳</span>
            <div>
              <h3 className="font-bold text-base text-amber-900 dark:text-amber-200">
                {isAr ? "طلب الانضمام قيد انتظار موافقة المالك" : "Membership Pending Approval"}
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {isAr
                  ? `المبنى: ${pendingRequest.unit.building.nameEn} · الوحدة: ${pendingRequest.unit.label}`
                  : `Building: ${pendingRequest.unit.building.nameEn} · Unit: ${pendingRequest.unit.label}`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-elevated p-8 rounded-2xl border-dashed border-2 border-teal-500/40 text-center space-y-4">
          <span className="text-4xl block">🔑</span>
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
            {isAr ? "لم تنضم إلى شقتك أو محلك بعد" : "You haven't joined your residence yet"}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {isAr
              ? "اطلب رمز المبنى الخاص من صاحب العقار وأدخل رقم شقتك لربط حسابك وإرسال طلبات الصيانة."
              : "Get the building join code from your landlord and enter your unit number to connect."}
          </p>
          <Link
            href="/tenant/join"
            className="inline-block px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
          >
            {isAr ? "طلب الانضمام إلى وحدة سكنية" : "Join a Residence"}
          </Link>
        </div>
      )}

      {/* Action Needed Alert: Awaiting Confirmation */}
      {awaitingConfirmation.length > 0 && (
        <div className="card-elevated p-5 rounded-2xl border-blue-500/30 bg-blue-50/30 dark:bg-blue-950/20 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <h4 className="font-bold text-sm text-blue-900 dark:text-blue-200">
              {isAr
                ? `أعمال صيانة مكتملة بانتظار فحصك وتأكيدك (${awaitingConfirmation.length})`
                : `Completed jobs awaiting your inspection (${awaitingConfirmation.length})`}
            </h4>
          </div>
          <div className="space-y-2">
            {awaitingConfirmation.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-surface p-3.5 rounded-xl border border-line"
              >
                <div>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100">{r.title}</span>
                  <span className="text-zinc-400 block mt-0.5">
                    {isAr ? "الفني المكلف:" : "Technician:"} {r.workOrder?.worker.name || "-"}
                  </span>
                </div>
                <Link
                  href={`/requests/${r.id}`}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center transition-colors shadow-xs"
                >
                  {isAr ? "فحص وتأكيد الإنجاز ←" : "Inspect & Confirm →"}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance Requests List */}
      <div className="card-elevated p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
            {isAr ? "سجل طلبات وبلاغات الصيانة" : "Maintenance Requests History"}
          </h3>
          <span className="text-xs text-zinc-500">
            {requests.length} {isAr ? "بلاغ مسجل" : "records"}
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
            <span className="text-3xl block">📋</span>
            <p>{t("noData")}</p>
          </div>
        ) : (
          <div className="divide-y divide-line text-sm">
            {requests.map((r) => {
              const statusClass =
                r.status === "AWAITING_TENANT_CONFIRMATION"
                  ? "badge-pending"
                  : r.status === "IN_PROGRESS"
                  ? "badge-in-progress"
                  : r.status === "TENANT_CONFIRMED" || r.status === "CLOSED"
                  ? "badge-completed"
                  : "badge-muted";

              return (
                <div
                  key={r.id}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/requests/${r.id}`}
                        className="font-bold text-base hover:text-teal-600 transition-colors"
                      >
                        {r.title}
                      </Link>
                      {r.urgency === "URGENT" && (
                        <span className="badge-status badge-urgent text-[10px]">
                          {isAr ? "🚨 طارئ" : "Urgent"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                      <span>{isAr ? r.category.nameAr : r.category.nameEn}</span>
                      <span>·</span>
                      <span>{new Date(r.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}</span>
                      {r.workOrder && (
                        <>
                          <span>·</span>
                          <span className="text-teal-600 dark:text-teal-400 font-medium">
                            {isAr ? "الفني:" : "Worker:"} {r.workOrder.worker.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`badge-status ${statusClass}`}>
                      {tReq(r.status as keyof typeof RequestStatus)}
                    </span>
                    <Link
                      href={`/requests/${r.id}`}
                      className="px-3 py-1.5 rounded-lg border border-line hover:border-teal-500/40 text-xs font-semibold hover:text-teal-600 transition-colors"
                    >
                      {isAr ? "التفاصيل ←" : "Details →"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
