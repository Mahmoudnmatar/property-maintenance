import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { requestMembership, getTenantActiveMembership } from "@/server/services/properties";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export default async function TenantJoinPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.TENANT) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const { activeTenancy, pendingRequest } = await getTenantActiveMembership(user);

  async function handleJoinRequest(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const joinCode = (formData.get("joinCode") as string)?.trim().toUpperCase();
    const unitLabel = (formData.get("unitLabel") as string)?.trim();

    if (joinCode && unitLabel) {
      try {
        await requestMembership(currentUser, { joinCode, unitLabel });
        revalidatePath("/[locale]/tenant/join", "page");
      } catch {
        // Handled via revalidation
      }
    }
  }

  return (
    <div className="max-w-lg mx-auto py-8 space-y-6">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          {isAr ? "الانضمام إلى وحدة سكنية" : "Join Your Residence"}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          {isAr
            ? "أدخل رمز المبنى المسلّم لك من صاحب العقار ورقم شقتك أو محلك"
            : "Enter the building join code provided by your landlord and your unit number"}
        </p>
      </div>

      {activeTenancy && (
        <div className="card-elevated p-6 rounded-2xl border-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/20 space-y-3">
          <span className="badge-status badge-completed text-xs">
            {isAr ? "✅ أنت مسجل حالياً في الوحدة:" : "✅ Currently registered in:"}
          </span>
          <h3 className="text-lg font-bold text-foreground">
            {activeTenancy.unit.building.nameEn} ·{" "}
            {activeTenancy.unit.type === "SHOP" ? (isAr ? "محل" : "Shop") : (isAr ? "شقة" : "Unit")}{" "}
            {activeTenancy.unit.label}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{activeTenancy.unit.building.address}</p>
          <div className="pt-2">
            <Link
              href="/tenant/home"
              className="inline-block px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold"
            >
              {isAr ? "الانتقال لصفحة وحدتي ←" : "Go to My Residence →"}
            </Link>
          </div>
        </div>
      )}

      {pendingRequest && !activeTenancy && (
        <div className="card-elevated p-6 rounded-2xl border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 space-y-3">
          <span className="badge-status badge-pending text-xs">
            {isAr ? "⏳ طلب الانضمام قيد المراجعة:" : "⏳ Membership Pending Review:"}
          </span>
          <h3 className="text-base font-bold text-foreground">
            {pendingRequest.unit.building.nameEn} · وحدة {pendingRequest.unit.label}
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {isAr
              ? `تم تقديم الطلب بتاريخ ${new Date(pendingRequest.createdAt).toLocaleDateString("ar-EG")}. بانتظار موافقة صاحب العقار.`
              : `Submitted on ${new Date(pendingRequest.createdAt).toLocaleDateString("en-US")}. Awaiting landlord approval.`}
          </p>
        </div>
      )}

      {!activeTenancy && !pendingRequest && (
        <div className="card-elevated p-6 rounded-2xl shadow-xs">
          <form action={handleJoinRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isAr ? "رمز انضمام المبنى (Join Code) *" : "Building Join Code *"}
              </label>
              <input
                name="joinCode"
                required
                placeholder={isAr ? "مثال: NOOR2026" : "e.g. NOOR2026"}
                className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground uppercase font-mono tracking-wider"
                dir="ltr"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">
                {isAr ? "تحصل على هذا الرمز مباشرة من صاحب العقار" : "Obtain this code directly from your building landlord"}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isAr ? "رقم الشقة أو المحل (Unit Label) *" : "Unit Label / Number *"}
              </label>
              <input
                name="unitLabel"
                required
                placeholder={isAr ? "مثال: 101 أو Shop A" : "e.g. 101 or Shop A"}
                className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              {isAr ? "إرسال طلب الانضمام للمالك ←" : "Send Join Request →"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
