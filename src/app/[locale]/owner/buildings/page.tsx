import { getCurrentUser } from "@/server/auth/actions";
import { getOwnerBuildings } from "@/server/services/properties";
import { redirect } from "@/i18n/routing";
import { revalidatePath } from "next/cache";
import { createBuilding, rotateBuildingJoinCode, createUnit, approveMembership, rejectMembership } from "@/server/services/properties";
import { UnitType, Role } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function OwnerBuildingsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.OWNER && user.role !== Role.SUPER_ADMIN)) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const buildings = await getOwnerBuildings(user);

  // Server actions for forms
  async function handleAddBuilding(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const nameEn = (formData.get("nameEn") as string)?.trim();
    const nameAr = (formData.get("nameAr") as string)?.trim();
    const address = (formData.get("address") as string)?.trim();

    if (nameEn && address) {
      await createBuilding(currentUser, { nameEn, nameAr, address });
      revalidatePath("/[locale]/owner/buildings", "page");
    }
  }

  async function handleRotateCode(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const buildingId = formData.get("buildingId") as string;
    if (buildingId) {
      await rotateBuildingJoinCode(currentUser, buildingId);
      revalidatePath("/[locale]/owner/buildings", "page");
    }
  }

  async function handleAddUnit(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const buildingId = formData.get("buildingId") as string;
    const label = (formData.get("label") as string)?.trim();
    const type = (formData.get("type") as UnitType) || UnitType.APARTMENT;
    const floor = (formData.get("floor") as string)?.trim();

    if (buildingId && label) {
      await createUnit(currentUser, buildingId, { label, type, floor });
      revalidatePath("/[locale]/owner/buildings", "page");
    }
  }

  async function handleApproveMember(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const requestId = formData.get("requestId") as string;
    if (requestId) {
      await approveMembership(currentUser, requestId);
      revalidatePath("/[locale]/owner/buildings", "page");
    }
  }

  async function handleRejectMember(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const requestId = formData.get("requestId") as string;
    if (requestId) {
      await rejectMembership(currentUser, requestId, isAr ? "رفض من المالك" : "Rejected by owner");
      revalidatePath("/[locale]/owner/buildings", "page");
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {isAr ? "المباني والوحدات العقارية" : "Buildings & Property Units"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {isAr
            ? "إدارة العقارات، استخراج رموز الانضمام للمستأجرين، واعتماد طلبات السكن"
            : "Manage properties, generate tenant join codes, and approve residential applications"}
        </p>
      </div>

      {/* Add Building Form */}
      <div className="card-elevated p-6 rounded-2xl space-y-4">
        <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span>➕</span>
          <span>{isAr ? "إضافة عقار / مبنى جديد" : "Add New Building"}</span>
        </h3>
        <form action={handleAddBuilding} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            name="nameEn"
            required
            placeholder={isAr ? "اسم المبنى (English)" : "Building Name (English)"}
            className="px-3.5 py-2.5 border border-line rounded-xl text-sm bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            dir="ltr"
          />
          <input
            name="nameAr"
            placeholder={isAr ? "اسم المبنى (بالعربي)" : "Building Name (Arabic)"}
            className="px-3.5 py-2.5 border border-line rounded-xl text-sm bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          />
          <input
            name="address"
            required
            placeholder={isAr ? "العنوان والشارع" : "Address & Street"}
            className="px-3.5 py-2.5 border border-line rounded-xl text-sm bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-xs cursor-pointer"
          >
            {isAr ? "إضافة المبنى" : "Add Building"}
          </button>
        </form>
      </div>

      {/* Buildings List */}
      <div className="space-y-6">
        {buildings.length === 0 ? (
          <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
            <span className="text-3xl block">🏢</span>
            <p>{isAr ? "لا توجد مباني مسجلة بعد. أضف مبناك الأول بالأعلى." : "No buildings added yet. Add your first building above."}</p>
          </div>
        ) : (
          buildings.map((b) => (
            <div key={b.id} className="card-elevated p-6 rounded-2xl space-y-5">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {b.nameEn} {b.nameAr ? `(${b.nameAr})` : ""}
                  </h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 mt-0.5">
                    <span>📍</span>
                    <span>{b.address}</span>
                  </span>
                </div>

                {/* Join Code Display & Rotate */}
                <div className="flex items-center gap-3 bg-teal-500/10 p-2.5 rounded-xl border border-teal-500/20">
                  <div className="text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 block text-[11px]">
                      {isAr ? "رمز انضمام المستأجرين:" : "Tenant Join Code:"}
                    </span>
                    <span
                      className="font-mono font-bold text-sm tracking-wider text-teal-700 dark:text-teal-300"
                      dir="ltr"
                    >
                      {b.joinCode}
                    </span>
                  </div>
                  <form action={handleRotateCode}>
                    <input type="hidden" name="buildingId" value={b.id} />
                    <button
                      type="submit"
                      className="p-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:text-teal-600 rounded-lg bg-surface border border-line shadow-xs cursor-pointer"
                      title={isAr ? "تغيير رمز الانضمام" : "Rotate Join Code"}
                    >
                      🔄
                    </button>
                  </form>
                </div>
              </div>

              {/* Units Grid */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">
                  {isAr ? `الوحدات والشقق (${b.units.length}):` : `Units (${b.units.length}):`}
                </h4>
                {b.units.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-3">{isAr ? "لم تتم إضافة أي وحدات لهذا المبنى بعد." : "No units added yet."}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {b.units.map((u) => {
                      const activeTenant = u.tenancies[0]?.tenant;
                      const pendingReqs = u.membershipRequests;

                      return (
                        <div
                          key={u.id}
                          className="p-4 rounded-xl bg-surface-muted/50 border border-line space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-foreground">
                              {u.type === "SHOP" ? (isAr ? "🏪 محل" : "🏪 Shop") : (isAr ? "🏠 شقة" : "🏠 Unit")}{" "}
                              {u.label}
                            </span>
                            <span
                              className={`badge-status text-[10px] ${
                                activeTenant ? "badge-completed" : "badge-muted"
                              }`}
                            >
                              {activeTenant ? (isAr ? "مشغولة" : "Occupied") : (isAr ? "شاغرة" : "Vacant")}
                            </span>
                          </div>

                          {activeTenant && (
                            <div className="text-xs text-zinc-600 dark:text-zinc-300 bg-surface/60 p-2.5 rounded-lg border border-line/50">
                              <span className="font-semibold block text-foreground">
                                {activeTenant.name}
                              </span>
                              <span className="block text-[11px] text-zinc-400 font-mono" dir="ltr">
                                {activeTenant.email}
                              </span>
                            </div>
                          )}

                          {/* Pending Membership Requests */}
                          {pendingReqs.length > 0 && (
                            <div className="pt-2 border-t border-line space-y-2">
                              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-bold block">
                                ⏳ {isAr ? "طلب انضمام جديد:" : "New Join Request:"}
                              </span>
                              {pendingReqs.map((req) => (
                                <div
                                  key={req.id}
                                  className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 text-xs space-y-1.5"
                                >
                                  <div className="font-bold text-foreground">{req.tenant.name}</div>
                                  <div className="text-[10px] text-zinc-400 font-mono" dir="ltr">
                                    {req.tenant.email}
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <form action={handleApproveMember} className="flex-1">
                                      <input type="hidden" name="requestId" value={req.id} />
                                      <button
                                        type="submit"
                                        className="w-full py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                      >
                                        {isAr ? "موافقة" : "Approve"}
                                      </button>
                                    </form>
                                    <form action={handleRejectMember} className="flex-1">
                                      <input type="hidden" name="requestId" value={req.id} />
                                      <button
                                        type="submit"
                                        className="w-full py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                                      >
                                        {isAr ? "رفض" : "Reject"}
                                      </button>
                                    </form>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add Unit Form */}
              <form
                action={handleAddUnit}
                className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-line text-xs"
              >
                <input type="hidden" name="buildingId" value={b.id} />
                <input
                  name="label"
                  required
                  placeholder={isAr ? "رقم الوحدة (مثال: 103)" : "Unit label (e.g. 103)"}
                  className="px-3 py-2 border border-line rounded-lg bg-surface text-foreground focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <select
                  name="type"
                  className="px-3 py-2 border border-line rounded-lg bg-surface text-foreground focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                >
                  <option value="APARTMENT">{isAr ? "شقة (Apartment)" : "Apartment"}</option>
                  <option value="SHOP">{isAr ? "محل تجاري (Shop)" : "Commercial Shop"}</option>
                </select>
                <input
                  name="floor"
                  placeholder={isAr ? "الطابق (اختياري)" : "Floor (optional)"}
                  className="px-3 py-2 border border-line rounded-lg bg-surface text-foreground focus:outline-hidden focus:ring-2 focus:ring-teal-500 w-28"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  {isAr ? "+ إضافة وحدة" : "+ Add Unit"}
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
