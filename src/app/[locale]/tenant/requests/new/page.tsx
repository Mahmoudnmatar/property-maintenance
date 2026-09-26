import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { prisma } from "@/server/db";
import { createMaintenanceRequest } from "@/server/services/requests";
import { getActiveCategories } from "@/server/services/workers";
import { Urgency, Role } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export default async function NewMaintenanceRequestPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.TENANT) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  // Find active tenancy
  const activeTenancy = await prisma.tenancy.findFirst({
    where: { tenantId: user.id, endedAt: null },
    include: { unit: { include: { building: true } } },
  });

  if (!activeTenancy) {
    redirect({ href: "/tenant/join", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const categories = await getActiveCategories();

  async function handleCreateRequest(formData: FormData) {
    "use server";
    const currentUser = await getCurrentUser();
    const currentLocale = await getLocale();
    if (!currentUser) return;

    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim();
    const categoryId = formData.get("categoryId") as string;
    const urgency = (formData.get("urgency") as Urgency) || Urgency.NORMAL;
    const desiredDate = formData.get("desiredDate") as string;

    if (title && description && categoryId) {
      const req = await createMaintenanceRequest(currentUser, {
        unitId: activeTenancy!.unit.id,
        categoryId,
        title,
        description,
        urgency,
        desiredDate: desiredDate || undefined,
      });

      redirect({ href: `/requests/${req.id}`, locale: currentLocale as "ar" | "en" });
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "الإبلاغ عن عطل صيانة جديد" : "Report a Maintenance Issue"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {activeTenancy.unit.building.nameEn} ·{" "}
            {activeTenancy.unit.type === "SHOP" ? (isAr ? "محل" : "Shop") : (isAr ? "شقة" : "Unit")}{" "}
            {activeTenancy.unit.label}
          </p>
        </div>
        <Link
          href="/tenant/home"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
        >
          {isAr ? "← العودة لوحدتي" : "← Back"}
        </Link>
      </div>

      <div className="card-elevated p-6 rounded-2xl shadow-xs">
        <form action={handleCreateRequest} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isAr ? "فئة الصيانة المطلوبة *" : "Maintenance Category *"}
            </label>
            <select
              name="categoryId"
              required
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
            >
              <option value="">{isAr ? "-- اختر فئة الصيانة --" : "-- Select Category --"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {isAr ? c.nameAr : c.nameEn} ({c.nameEn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isAr ? "عنوان البلاغ (ملخص المشكلة) *" : "Issue Summary *"}
            </label>
            <input
              name="title"
              required
              placeholder={isAr ? "مثال: تسريب مياه تحت مغسلة الحمام" : "e.g. Water leak under sink"}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isAr ? "وصف العطل بالتفصيل *" : "Detailed Description *"}
            </label>
            <textarea
              name="description"
              required
              rows={4}
              placeholder={isAr ? "يرجى وصف المشكلة بدقة ومكان حدوثها وأي تفاصيل تساعد الفني..." : "Describe the problem clearly..."}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isAr ? "درجة الاستعجال" : "Urgency"}
              </label>
              <select
                name="urgency"
                defaultValue="NORMAL"
                className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground font-semibold"
              >
                <option value="LOW">{isAr ? "🟢 منخفضة (Low)" : "🟢 Low"}</option>
                <option value="NORMAL">{isAr ? "🔵 عادية (Normal)" : "🔵 Normal"}</option>
                <option value="URGENT">{isAr ? "🚨 طارئة ومستعجلة (Urgent)" : "🚨 Urgent"}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                {isAr ? "موعد الزيارة المفضل (اختياري)" : "Preferred Date (optional)"}
              </label>
              <input
                name="desiredDate"
                type="date"
                className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              {isAr ? "إرسال البلاغ لصاحب العقار ←" : "Submit Request →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
