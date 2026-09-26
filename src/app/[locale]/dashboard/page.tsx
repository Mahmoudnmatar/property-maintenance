import { getCurrentUser } from "@/server/auth/actions";
import { redirect, Link } from "@/i18n/routing";
import { prisma } from "@/server/db";
import { getTranslations, getLocale } from "next-intl/server";
import { Role, RequestStatus, MembershipStatus, WorkerStatus } from "@prisma/client";

export default async function DashboardPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const t = await getTranslations("common");
  const tRoles = await getTranslations("roles");
  const tReq = await getTranslations("requestStatus");

  // ─── Owner Dashboard Data ────────────────────────────────────────────────
  if (user.role === Role.OWNER) {
    const buildings = await prisma.building.findMany({
      where: { ownerId: user.id, archivedAt: null },
      include: {
        units: {
          where: { archivedAt: null },
          include: {
            tenancies: { where: { endedAt: null } },
            membershipRequests: { where: { status: MembershipStatus.PENDING } },
          },
        },
      },
    });

    const totalUnits = buildings.reduce((acc, b) => acc + b.units.length, 0);
    const occupiedUnits = buildings.reduce(
      (acc, b) => acc + b.units.filter((u) => u.tenancies.length > 0).length,
      0
    );
    const pendingMemberships = buildings.reduce(
      (acc, b) => acc + b.units.reduce((uAcc, u) => uAcc + u.membershipRequests.length, 0),
      0
    );

    const requests = await prisma.maintenanceRequest.findMany({
      where: {
        unit: { building: { ownerId: user.id } },
      },
      include: { unit: { include: { building: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {t("dashboard")} · {tRoles(Role.OWNER)}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isAr ? `أهلاً بك، ${user.name}` : `Welcome back, ${user.name}`}
            </p>
          </div>
          <Link
            href="/owner/buildings"
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm w-fit"
          >
            + {isAr ? "إضافة مبنى جديد" : "Add Building"}
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "إجمالي المباني" : "Total Buildings"}
            </span>
            <span className="text-3xl font-extrabold text-teal-600 dark:text-teal-400 font-mono">
              {buildings.length}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "الوحدات (المشغولة / الإجمالي)" : "Occupancy (Units)"}
            </span>
            <span className="text-3xl font-extrabold text-foreground font-mono">
              {occupiedUnits} / {totalUnits}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "طلبات انضمام معلقة" : "Pending Memberships"}
            </span>
            <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
              {pendingMemberships}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "بلاغات نشطة" : "Active Tickets"}
            </span>
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
              {requests.filter((r) => r.status !== RequestStatus.CLOSED && r.status !== RequestStatus.CANCELLED).length}
            </span>
          </div>
        </div>

        {/* Action alerts */}
        {pendingMemberships > 0 && (
          <div className="card-elevated p-5 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                  {isAr
                    ? `لديك ${pendingMemberships} طلب انضمام شقق بانتظار موافقتك`
                    : `You have ${pendingMemberships} pending unit join requests`}
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {isAr ? "قم بمراجعة بيانات المستأجرين واعتمادهم." : "Review tenant details and grant access."}
                </p>
              </div>
            </div>
            <Link
              href="/owner/buildings"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs shrink-0"
            >
              {isAr ? "مراجعة الطلبات" : "Review Requests"}
            </Link>
          </div>
        )}

        {/* Recent Maintenance Requests */}
        <div className="card-elevated p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">{t("requests")}</h3>
            <Link href="/owner/requests" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold">
              {isAr ? "عرض الكل ←" : "View all →"}
            </Link>
          </div>

          {requests.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">{t("noData")}</p>
          ) : (
            <div className="divide-y divide-line text-sm">
              {requests.map((r) => {
                const statusClass =
                  r.status === "AWAITING_TENANT_CONFIRMATION" || r.status === "SUBMITTED"
                    ? "badge-pending"
                    : r.status === "PROCUREMENT"
                    ? "badge-procurement"
                    : r.status === "IN_PROGRESS"
                    ? "badge-in-progress"
                    : r.status === "TENANT_CONFIRMED" || r.status === "CLOSED"
                    ? "badge-completed"
                    : "badge-muted";

                return (
                  <div key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <Link href={`/requests/${r.id}`} className="font-bold hover:text-teal-600 transition-colors">
                        {r.title}
                      </Link>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {r.unit.building.nameEn} · وحدة {r.unit.label}
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
                        {isAr ? "إدارة ←" : "Manage →"}
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

  // ─── Tenant Dashboard Data ────────────────────────────────────────────────
  if (user.role === Role.TENANT) {
    const activeTenancy = await prisma.tenancy.findFirst({
      where: { tenantId: user.id, endedAt: null },
      include: { unit: { include: { building: true } } },
    });

    const pendingRequest = await prisma.membershipRequest.findFirst({
      where: { tenantId: user.id, status: MembershipStatus.PENDING },
      include: { unit: { include: { building: true } } },
    });

    const requests = await prisma.maintenanceRequest.findMany({
      where: { namedTenantId: user.id },
      include: { unit: { include: { building: true } } },
      orderBy: { createdAt: "desc" },
    });

    const needsConfirmation = requests.filter(
      (r) => r.status === RequestStatus.AWAITING_TENANT_CONFIRMATION
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {t("dashboard")} · {tRoles(Role.TENANT)}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isAr ? `أهلاً بك، ${user.name}` : `Welcome back, ${user.name}`}
            </p>
          </div>
          {activeTenancy && (
            <Link
              href="/tenant/requests/new"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-all shadow-sm w-fit"
            >
              + {isAr ? "إبلاغ عن عطل جديد" : "New Request"}
            </Link>
          )}
        </div>

        {/* Tenancy Status Banner */}
        {!activeTenancy && !pendingRequest && (
          <div className="card-elevated p-8 rounded-2xl border-dashed border-2 border-teal-500/40 text-center space-y-3">
            <span className="text-4xl block">🔑</span>
            <h3 className="font-bold text-lg text-foreground">
              {isAr ? "لم تنضم إلى شقتك أو محلك بعد" : "You haven't joined your residence yet"}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              {isAr
                ? "أدخل رمز المبنى الذي زوّدك به صاحب العقار ورقم شقتك لطلب الانضمام."
                : "Enter the building join code from your landlord and your unit number."}
            </p>
            <Link
              href="/tenant/join"
              className="inline-block px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold shadow-xs"
            >
              {isAr ? "طلب الانضمام إلى وحدة سكنية" : "Join a Residence"}
            </Link>
          </div>
        )}

        {pendingRequest && (
          <div className="card-elevated p-5 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⏳</span>
              <div>
                <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                  {isAr ? "طلب الانضمام قيد انتظار موافقة المالك" : "Membership Pending Approval"}
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {pendingRequest.unit.building.nameEn} · وحدة {pendingRequest.unit.label}
                </p>
              </div>
            </div>
            <Link href="/tenant/home" className="text-xs text-amber-800 dark:text-amber-300 font-semibold underline">
              {isAr ? "تفاصيل الطلب ←" : "View Details →"}
            </Link>
          </div>
        )}

        {activeTenancy && (
          <div className="card-elevated p-5 rounded-2xl border-teal-500/30 bg-teal-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏠</span>
              <div>
                <h4 className="font-bold text-sm text-teal-900 dark:text-teal-200">
                  {isAr ? "وحدتك السكنية الحالية:" : "Your Residence:"} {activeTenancy.unit.building.nameEn} - وحدة {activeTenancy.unit.label}
                </h4>
                <p className="text-xs text-teal-700 dark:text-teal-300 mt-0.5">
                  {activeTenancy.unit.building.address}
                </p>
              </div>
            </div>
            <Link
              href="/tenant/requests/new"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs shrink-0"
            >
              {isAr ? "إبلاغ عن عطل" : "Report Issue"}
            </Link>
          </div>
        )}

        {/* Needs Confirmation Alert */}
        {needsConfirmation.length > 0 && (
          <div className="card-elevated p-5 rounded-2xl border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/20 space-y-3">
            <h4 className="font-bold text-sm text-blue-900 dark:text-blue-200">
              ⚠️ {isAr ? `أعمال صيانة مكتملة بانتظار فحصك وتأكيدك (${needsConfirmation.length})` : `Completed work awaiting your sign-off (${needsConfirmation.length})`}
            </h4>
            <div className="space-y-2">
              {needsConfirmation.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs bg-surface p-3 rounded-xl border border-line">
                  <span className="font-bold text-foreground">{r.title}</span>
                  <Link href={`/requests/${r.id}`} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                    {isAr ? "فحص وتأكيد الإنجاز ←" : "Inspect & Confirm →"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Maintenance Requests List */}
        <div className="card-elevated p-6 rounded-2xl space-y-4">
          <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">{t("requests")}</h3>
          {requests.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">{t("noData")}</p>
          ) : (
            <div className="divide-y divide-line text-sm">
              {requests.map((r) => (
                <div key={r.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <Link href={`/requests/${r.id}`} className="font-bold hover:text-teal-600 transition-colors">
                      {r.title}
                    </Link>
                    <div className="text-xs text-zinc-400 font-mono mt-0.5">
                      {new Date(r.createdAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge-status badge-procurement">
                      {tReq(r.status as keyof typeof RequestStatus)}
                    </span>
                    <Link href={`/requests/${r.id}`} className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold">
                      {isAr ? "تفاصيل ←" : "Details →"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Worker Dashboard Data ────────────────────────────────────────────────
  if (user.role === Role.WORKER) {
    const profile = await prisma.workerProfile.findUnique({
      where: { userId: user.id },
      include: {
        categories: { include: { category: true } },
        areas: { include: { area: true } },
        evaluations: true,
      },
    });

    const isApproved = profile?.status === WorkerStatus.APPROVED;

    const assignedJobs = await prisma.workOrder.findMany({
      where: { workerId: user.id },
      include: { request: true },
      orderBy: { assignedAt: "desc" },
    });

    const activeTenders = isApproved
      ? await prisma.procurement.findMany({
          where: {
            status: "OPEN",
            offers: { none: { workerId: user.id } },
          },
          include: { request: true },
          take: 5,
        })
      : [];

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {t("dashboard")} · {tRoles(Role.WORKER)}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {isAr ? `أهلاً بك، ${user.name}` : `Welcome back, ${user.name}`}
            </p>
          </div>
          <Link
            href="/worker/profile"
            className="px-4 py-2 border border-line rounded-xl text-xs font-semibold hover:border-teal-500/40 w-fit"
          >
            {isAr ? "الملف والاعتماد المهني" : "Credential Profile"}
          </Link>
        </div>

        {/* Verification Status Banner */}
        {!isApproved && (
          <div className="card-elevated p-5 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 space-y-2">
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
              {profile?.status === WorkerStatus.PENDING_REVIEW
                ? (isAr ? "ملفك المهني قيد المراجعة والتقييم من قبل إدارة المنصة" : "Your profile is under admin review")
                : (isAr ? "يرجى استكمال ملفك المهني وشهادات الخبرة وتقديمه للاعتماد" : "Please complete your profile and submit for verification")}
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {isAr
                ? "لا يمكنك تقديم عروض أسعار أو المشاركة في المناقصات قبل اعتماد حسابك رسمياً."
                : "You cannot submit quotes or join tenders until verified."}
            </p>
            <div className="pt-1">
              <Link
                href="/worker/profile"
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold inline-block"
              >
                {isAr ? "إدارة الملف المهني ←" : "Manage Profile →"}
              </Link>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "حالة الاعتماد" : "Status"}
            </span>
            <span className="text-xl font-bold text-teal-600 dark:text-teal-400">
              {profile?.status || "DRAFT"}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "التخصصات المعتمدة" : "Specialties"}
            </span>
            <span className="text-3xl font-extrabold text-foreground font-mono">
              {profile?.categories.length || 0}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "المهام المكلف بها" : "Assigned Jobs"}
            </span>
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
              {assignedJobs.length}
            </span>
          </div>
          <Link
            href="/worker/opportunities"
            className="card-elevated p-5 rounded-2xl hover:border-teal-500/50 transition-colors"
          >
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "مناقصات وفرص متاحة" : "Open Tenders"}
            </span>
            <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
              {activeTenders.length}
            </span>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold block mt-1">
              {isAr ? "عرض الفرص ←" : "Browse opportunities →"}
            </span>
          </Link>
        </div>

        {/* Assigned Jobs */}
        <div className="card-elevated p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">
              {isAr ? "المهام المكلف بها" : "Assigned Jobs"}
            </h3>
            <Link href="/worker/jobs" className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold">
              {isAr ? "عرض الكل ←" : "View all →"}
            </Link>
          </div>
          {assignedJobs.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">{t("noData")}</p>
          ) : (
            <div className="divide-y divide-line text-sm">
              {assignedJobs.map((j) => (
                <div key={j.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <Link href={`/requests/${j.requestId}`} className="font-bold hover:text-teal-600 transition-colors">
                      {j.request.title}
                    </Link>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      {isAr ? "المبلغ المتفق عليه:" : "Agreed:"} {(j.agreedAmountAgorot / 100).toFixed(2)} {isAr ? "شيكل" : "ILS"}
                    </div>
                  </div>
                  <Link
                    href={`/requests/${j.requestId}`}
                    className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                  >
                    {isAr ? "متابعة التنفيذ" : "Execute"}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Super Admin Dashboard Data ───────────────────────────────────────────
  if (user.role === Role.SUPER_ADMIN) {
    const pendingWorkers = await prisma.workerProfile.count({
      where: { status: WorkerStatus.PENDING_REVIEW },
    });
    const totalUsers = await prisma.user.count();
    const totalRequests = await prisma.maintenanceRequest.count();
    const categoriesCount = await prisma.serviceCategory.count();

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {t("dashboard")} · {tRoles(Role.SUPER_ADMIN)}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {isAr ? "لوحة الإدارة والرقابة الشاملة على المنصة" : "Platform Management & Audit Console"}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "فنيون بانتظار الاعتماد" : "Pending Technicians"}
            </span>
            <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
              {pendingWorkers}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "إجمالي المستخدمين" : "Total Users"}
            </span>
            <span className="text-3xl font-extrabold text-teal-600 dark:text-teal-400 font-mono">
              {totalUsers}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "إجمالي بلاغات الصيانة" : "Total Tickets"}
            </span>
            <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
              {totalRequests}
            </span>
          </div>
          <div className="card-elevated p-5 rounded-2xl">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1">
              {isAr ? "فئات الصيانة المعرفة" : "Categories"}
            </span>
            <span className="text-3xl font-extrabold text-foreground font-mono">
              {categoriesCount}
            </span>
          </div>
        </div>

        {pendingWorkers > 0 && (
          <div className="card-elevated p-5 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                {isAr
                  ? `يوجد ${pendingWorkers} طلب تسجيل فني جديد بحاجة للتقييم والاعتماد`
                  : `There are ${pendingWorkers} technician applications awaiting review`}
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {isAr ? "تقييم الخبرة لكل تخصص من 1 إلى 5 قبل إتاحة الفني للعمل." : "Score experience before verifying for public marketplace."}
              </p>
            </div>
            <Link
              href="/admin/workers"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs shrink-0"
            >
              {isAr ? "طابور المراجعة ←" : "Review Queue →"}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return null;
}
