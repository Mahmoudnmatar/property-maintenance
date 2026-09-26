import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { getPendingWorkerApplications, evaluateAndDecideWorkerApplication, suspendWorker } from "@/server/services/workers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export default async function AdminWorkersPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.SUPER_ADMIN) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const pendingWorkers = await getPendingWorkerApplications(user);
  const allApproved = await prisma.workerProfile.findMany({
    where: { status: "APPROVED" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      categories: { include: { category: true } },
      evaluations: true,
    },
  });

  async function handleDecide(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;

    const profileId = formData.get("profileId") as string;
    const decision = formData.get("decision") as "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    const reason = formData.get("reason") as string;

    const profile = await prisma.workerProfile.findUnique({
      where: { id: profileId },
      include: { categories: true },
    });

    if (!profile) return;

    const evaluations = profile.categories.map((c) => {
      const score = parseInt(formData.get(`score_${c.categoryId}`) as string, 10) || 4;
      const summary = (formData.get(`summary_${c.categoryId}`) as string) || "خبرة مهنية جيدة وموثقة";
      return { categoryId: c.categoryId, score, publicSummary: summary };
    });

    await evaluateAndDecideWorkerApplication(cu, profileId, decision, evaluations, reason);
    revalidatePath("/[locale]/admin/workers", "page");
  }

  async function handleSuspend(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const profileId = formData.get("profileId") as string;
    const reason = formData.get("reason") as string;

    if (profileId) {
      await suspendWorker(cu, profileId, reason || "إيقاف مؤقت من الإدارة");
      revalidatePath("/[locale]/admin/workers", "page");
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "إدارة واعتماد الفنيين" : "Worker Verification Console"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "مراجعة التخصصات وسنوات الخبرة والشهادات، وإصدار التقييم المهني (1-5) قبل الاعتماد"
              : "Review credentials, audit years of experience, and assign official ratings"}
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة الإدارة" : "← Admin Dashboard"}
        </Link>
      </div>

      {/* Pending Applications Queue */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <span>⏳ {isAr ? "طلبات التسجيل بانتظار التقييم والاعتماد" : "Pending Applications Queue"}</span>
          <span className="badge-status badge-pending text-xs">
            {pendingWorkers.length}
          </span>
        </h2>

        {pendingWorkers.length === 0 ? (
          <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
            <span className="text-3xl block">✨</span>
            <p>{isAr ? "لا توجد طلبات فنيين معلقة حالياً. جميع الطلبات مراجعة ومكتملة!" : "No pending worker applications. All reviews completed!"}</p>
          </div>
        ) : (
          pendingWorkers.map((pw) => (
            <div key={pw.id} className="card-elevated p-6 rounded-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 gap-2">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100">{pw.user.name}</h3>
                  <span className="text-xs text-zinc-400 font-mono" dir="ltr">{pw.user.email}</span>
                </div>
                <span className="badge-status badge-pending text-xs">
                  {isAr ? `المراجعة: الإصدار ${pw.submittedRevision || pw.currentRevision}` : `Revision ${pw.submittedRevision || pw.currentRevision}`}
                </span>
              </div>

              {pw.bio && (
                <div className="text-xs text-zinc-600 dark:text-zinc-300 bg-surface-muted/50 p-3.5 rounded-xl border border-line">
                  <span className="font-bold block text-zinc-400 mb-1">{isAr ? "نبذة الفني:" : "Technician Bio:"}</span>
                  <p>{pw.bio}</p>
                </div>
              )}

              {/* Evaluation Form */}
              <form action={handleDecide} className="space-y-4 pt-2">
                <input type="hidden" name="profileId" value={pw.id} />

                <div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
                    {isAr ? "تقييم الخبرة المهنية لكل تخصص مطلوب (من 1 إلى 5):" : "Official Specialty Evaluation (1 to 5 stars):"}
                  </h4>
                  <div className="space-y-3">
                    {pw.categories.map((c) => (
                      <div
                        key={c.categoryId}
                        className="p-4 border border-line rounded-xl bg-surface-muted/30 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground">
                            {c.category.nameAr} ({c.category.nameEn})
                          </span>
                          <span className="text-zinc-400">
                            {isAr ? `الخبرة المصرحة: ${c.experienceYears} سنوات` : `Reported: ${c.experienceYears} yrs`}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <select
                            name={`score_${c.categoryId}`}
                            defaultValue="4"
                            className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground font-semibold"
                          >
                            <option value="5">⭐⭐⭐⭐⭐ 5</option>
                            <option value="4">⭐⭐⭐⭐ 4</option>
                            <option value="3">⭐⭐⭐ 3</option>
                            <option value="2">⭐⭐ 2</option>
                            <option value="1">⭐ 1</option>
                          </select>
                          <input
                            name={`summary_${c.categoryId}`}
                            required
                            placeholder={isAr ? "ملخص تقييم الإدارة المهني العام" : "Evaluation notes"}
                            defaultValue={isAr ? "فني معتمد ذو خبرة موثقة وسجل أعمال سليم" : "Verified technician with vetted track record"}
                            className="sm:col-span-3 px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="submit"
                    name="decision"
                    value="APPROVED"
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    {isAr ? "✅ اعتماد وتفعيل الفني في المنصة" : "✅ Approve & Activate"}
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="CHANGES_REQUESTED"
                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isAr ? "طلب استكمال مستندات" : "Request Changes"}
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="REJECTED"
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    {isAr ? "رفض الطلب" : "Reject"}
                  </button>
                </div>
              </form>
            </div>
          ))
        )}
      </div>

      {/* Approved Workers Summary & Suspension Controls */}
      <div className="space-y-4 pt-6 border-t border-line">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          {isAr ? `الفنيون المعتمدون حالياً (${allApproved.length})` : `Currently Approved Technicians (${allApproved.length})`}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {allApproved.map((w) => (
            <div key={w.id} className="card-elevated p-5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-base text-foreground">{w.user.name}</span>
                <span className="badge-status badge-completed text-[11px]">
                  {isAr ? "معتمد ومفعل" : "Active"}
                </span>
              </div>
              <div className="text-xs text-zinc-500">
                {isAr ? "التخصصات:" : "Specialties:"} {w.categories.map((c) => c.category.nameAr).join("، ")}
              </div>
              <form action={handleSuspend} className="pt-2 border-t border-line flex gap-2">
                <input type="hidden" name="profileId" value={w.id} />
                <input
                  name="reason"
                  placeholder={isAr ? "سبب التعليق..." : "Suspension reason..."}
                  className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground flex-1"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isAr ? "إيقاف مؤقت" : "Suspend"}
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
