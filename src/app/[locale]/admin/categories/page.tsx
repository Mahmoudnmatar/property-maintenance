import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { createServiceCategory, toggleServiceCategory } from "@/server/services/workers";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function AdminCategoriesPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.SUPER_ADMIN) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { displayOrder: "asc" },
  });

  async function handleCreate(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current || current.role !== Role.SUPER_ADMIN) return;

    const code = String(formData.get("code")).trim().toUpperCase();
    const nameAr = String(formData.get("nameAr")).trim();
    const nameEn = String(formData.get("nameEn")).trim();

    if (code && nameAr && nameEn) {
      await createServiceCategory(current, { code, nameAr, nameEn });
      revalidatePath("/[locale]/admin/categories", "page");
    }
  }

  async function handleToggle(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current || current.role !== Role.SUPER_ADMIN) return;

    const id = String(formData.get("id"));
    const active = formData.get("active") !== "true";

    await toggleServiceCategory(current, id, active);
    revalidatePath("/[locale]/admin/categories", "page");
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "فئات وتخصصات الصيانة" : "Service Categories Management"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "إدارة فئات الصيانة المعتمدة وإضافة تخصصات جديدة وتفعيلها" : "Create and toggle verified maintenance specialty categories"}
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة الإدارة" : "← Admin Dashboard"}
        </Link>
      </div>

      {/* Add New Category Form */}
      <div className="card-elevated p-6 rounded-2xl space-y-4">
        <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span>➕</span>
          <span>{isAr ? "إضافة فئة صيانة جديدة" : "Add New Category"}</span>
        </h3>
        <form action={handleCreate} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            name="code"
            required
            placeholder="CODE (e.g. ELEC)"
            className="px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface uppercase font-mono"
            dir="ltr"
          />
          <input
            name="nameAr"
            required
            placeholder="الاسم بالعربية (مثال: كهرباء)"
            className="px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface"
          />
          <input
            name="nameEn"
            required
            placeholder="English Name (e.g. Electrical)"
            className="px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface"
            dir="ltr"
          />
          <button
            type="submit"
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            {isAr ? "إضافة الفئة" : "Add Category"}
          </button>
        </form>
      </div>

      {/* Categories List */}
      <div className="space-y-3">
        {categories.map((category) => (
          <div
            key={category.id}
            className="card-elevated p-5 rounded-2xl flex items-center justify-between gap-4"
          >
            <div>
              <strong className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {category.nameAr}
              </strong>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 mx-2" dir="ltr">
                {category.nameEn} · <code className="font-mono text-zinc-400">{category.code}</code>
              </span>
            </div>

            <form action={handleToggle}>
              <input type="hidden" name="id" value={category.id} />
              <input type="hidden" name="active" value={String(category.isActive)} />
              <button
                type="submit"
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  category.isActive
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-surface-muted text-zinc-500 border-line hover:bg-surface-muted/80"
                }`}
              >
                {category.isActive
                  ? (isAr ? "✅ فعالة (انقر للإيقاف)" : "✅ Active (Click to disable)")
                  : (isAr ? "⏸️ متوقفة (انقر للتفعيل)" : "⏸️ Disabled (Click to activate)")}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
