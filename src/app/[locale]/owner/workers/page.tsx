import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { Link } from "@/i18n/routing";
import { searchApprovedWorkers, getActiveCategories } from "@/server/services/workers";
import { getWorkerFeedbackSummary } from "@/server/services/feedback";
import { getLocale } from "next-intl/server";
import { Role } from "@prisma/client";

export default async function OwnerWorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string; areaId?: string }>;
}) {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.OWNER && user.role !== Role.SUPER_ADMIN)) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const { categoryId, areaId } = await searchParams;
  const categories = await getActiveCategories();
  const workers = await searchApprovedWorkers(user, { categoryId, areaId });

  // Augment with tenant review statistics
  const workersWithReviews = await Promise.all(
    workers.map(async (w) => {
      const feedback = await getWorkerFeedbackSummary(w.userId);
      return { ...w, feedback };
    })
  );

  const isAr = locale === "ar";

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "دليل الفنيين المعتمدين" : "Approved Technicians Directory"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "تصفح الفنيين المعتمدين رسمياً من إدارة المنصة حسب التخصص والمنطقة والتقييمات"
              : "Browse officially vetted technicians by specialty, coverage area, and tenant reviews"}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة التحكم" : "← Back to Dashboard"}
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="card-elevated p-4 rounded-xl flex flex-wrap gap-3 items-center">
        <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">
          {isAr ? "تصفية حسب التخصص:" : "Filter by specialty:"}
        </span>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/owner/workers?categoryId=${c.id}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                categoryId === c.id
                  ? "bg-teal-600 text-white border-teal-600 shadow-xs"
                  : "bg-surface-muted/60 text-foreground border-line hover:border-teal-500/40"
              }`}
            >
              {isAr ? c.nameAr : c.nameEn}
            </Link>
          ))}
          {categoryId && (
            <Link
              href="/owner/workers"
              className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
            >
              {isAr ? "إلغاء التصفية ✕" : "Clear filter ✕"}
            </Link>
          )}
        </div>
      </div>

      {/* Workers Grid */}
      {workersWithReviews.length === 0 ? (
        <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
          <span className="text-3xl block">🔍</span>
          <p>{isAr ? "لا يوجد فنيون معتمدون يطابقون هذا الفلتر حالياً." : "No verified technicians match this filter."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workersWithReviews.map((w) => (
            <div key={w.id} className="card-elevated p-6 rounded-2xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-lg">
                    {w.user.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">{w.user.name}</h3>
                    <span className="text-xs text-zinc-400 block mt-0.5">
                      {w.areas.map((a) => (isAr ? a.area.nameAr : a.area.nameEn)).join(" · ") || (isAr ? "جميع المناطق" : "All areas")}
                    </span>
                  </div>
                </div>
                <span className="badge-status badge-completed text-[11px]">
                  {isAr ? "معتمد رسمياً" : "Verified"}
                </span>
              </div>

              {w.bio && (
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed bg-surface-muted/40 p-3 rounded-xl border border-line/60">
                  {w.bio}
                </p>
              )}

              {/* Specializations */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-400 block uppercase tracking-wider">
                  {isAr ? "التخصصات والخبرة المعتمدة:" : "Specialties & Experience:"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {w.categories.map((c) => (
                    <span
                      key={c.categoryId}
                      className="px-2.5 py-1 bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 text-xs font-semibold rounded-lg"
                    >
                      {isAr ? c.category.nameAr : c.category.nameEn} ({c.experienceYears} {isAr ? "سنوات" : "yrs"})
                    </span>
                  ))}
                </div>
              </div>

              {/* Two Separate Evaluation Summaries: Admin Vetting vs Tenant Reviews */}
              <div className="pt-3 border-t border-line grid grid-cols-2 gap-3 text-xs">
                {/* Admin Audit Score */}
                <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
                  <span className="text-[11px] text-zinc-400 block mb-1">
                    {isAr ? "تقييم الإدارة المهني:" : "Admin Vetting:"}
                  </span>
                  <div className="flex items-center gap-1 font-bold text-sm text-foreground">
                    <span className="text-amber-500">★</span>
                    <span>
                      {w.evaluations.length > 0
                        ? (
                            w.evaluations.reduce((acc, e) => acc + e.score, 0) /
                            w.evaluations.length
                          ).toFixed(1)
                        : "5.0"}
                    </span>
                    <span className="text-xs text-zinc-400">/ 5</span>
                  </div>
                </div>

                {/* Tenant Real Reviews */}
                <div className="p-3 rounded-xl bg-surface-muted/50 border border-line/60">
                  <span className="text-[11px] text-zinc-400 block mb-1">
                    {isAr ? "تقييم المستأجرين:" : "Tenant Reviews:"}
                  </span>
                  <div className="flex items-center gap-1 font-bold text-sm text-foreground">
                    <span className="text-emerald-500">★</span>
                    <span>
                      {w.feedback.count > 0 ? (w.feedback.average?.toFixed(1) ?? "—") : (isAr ? "جديد" : "New")}
                    </span>
                    {w.feedback.count > 0 && (
                      <span className="text-[11px] text-zinc-400 font-normal">
                        ({w.feedback.count} {isAr ? "تقييم" : "reviews"})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
