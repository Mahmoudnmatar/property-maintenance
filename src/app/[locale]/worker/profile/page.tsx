import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { getOrCreateWorkerProfile, updateWorkerDraft, submitWorkerApplication, getActiveCategories, getActiveAreas } from "@/server/services/workers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { EvidenceKind, Role } from "@prisma/client";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

export default async function WorkerProfilePage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.WORKER) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const profile = await getOrCreateWorkerProfile(user);
  const categories = await getActiveCategories();
  const areas = await getActiveAreas();

  // Server actions
  async function handleUpdateProfile(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;

    const bio = formData.get("bio") as string;
    const categoryIds = formData.getAll("categoryIds") as string[];
    const areaIds = formData.getAll("areaIds") as string[];

    const categoriesData = categoryIds.map((cid) => {
      const exp = parseInt(formData.get(`exp_${cid}`) as string, 10) || 0;
      return { categoryId: cid, experienceYears: exp };
    });

    await updateWorkerDraft(cu, {
      bio,
      categories: categoriesData,
      areaIds,
    });
    revalidatePath("/[locale]/worker/profile", "page");
  }

  async function handleAddMockEvidence(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    const kind = formData.get("kind") as EvidenceKind;
    const caption = formData.get("caption") as string;

    const attachment = await prisma.attachment.create({
      data: {
        uploaderId: cu.id,
        storageKey: `evidence_${Date.now()}.jpg`,
        originalName: `${kind.toLowerCase()}_sample.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024 * 100,
        isFinalized: true,
      },
    });

    await prisma.workerEvidence.create({
      data: {
        workerProfileId: profile.id,
        attachmentId: attachment.id,
        kind,
        caption: caption || `${kind} sample`,
        publishConsent: kind === "PORTFOLIO",
        adminApproved: true,
      },
    });

    revalidatePath("/[locale]/worker/profile", "page");
  }

  async function handleSubmitApp() {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;
    try {
      await submitWorkerApplication(cu);
      revalidatePath("/[locale]/worker/profile", "page");
    } catch {
      // Handled
    }
  }

  const statusClass =
    profile.status === "APPROVED"
      ? "badge-completed"
      : profile.status === "PENDING_REVIEW"
      ? "badge-pending"
      : profile.status === "CHANGES_REQUESTED"
      ? "badge-danger"
      : "badge-muted";

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "الملف والاعتماد المهني للفني" : "Technician Credential Profile"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "اختر تخصصاتك وسنوات خبرتك ومناطق خدمتك وشهاداتك للاعتماد الرسمي"
              : "Select your specialties, experience years, service areas, and verification evidence"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge-status ${statusClass} text-xs font-bold`}>
            {profile.status}
          </span>
          <Link
            href="/dashboard"
            className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
          >
            {isAr ? "← لوحة التحكم" : "← Dashboard"}
          </Link>
        </div>
      </div>

      {/* Admin Evaluations Display */}
      {profile.evaluations.length > 0 && (
        <div className="card-elevated p-5 rounded-2xl border-teal-500/30 bg-teal-500/10 space-y-2">
          <h4 className="font-bold text-xs text-teal-800 dark:text-teal-200 uppercase tracking-wider">
            ⭐ {isAr ? "التقييم المهني المعتمد من إدارة المنصة:" : "Official Admin Evaluation:"}
          </h4>
          <div className="space-y-1.5">
            {profile.evaluations.map((ev) => (
              <div key={ev.id} className="text-xs text-foreground flex items-center gap-2">
                <span className="font-extrabold text-teal-700 dark:text-teal-300 font-mono">
                  {ev.score} / 5
                </span>
                <span>—</span>
                <span className="text-zinc-600 dark:text-zinc-300">{ev.publicSummary}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="card-elevated p-6 rounded-2xl space-y-6">
        <form action={handleUpdateProfile} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
              {isAr ? "نبذة عن خبرتك وسيرتك المهنية" : "Professional Bio & Overview"}
            </label>
            <textarea
              name="bio"
              rows={3}
              defaultValue={profile.bio || ""}
              placeholder={isAr ? "اكتب نبذة مختصرة عن خبرتك والأعمال التي تنفذها..." : "Write a brief summary of your work and experience..."}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl bg-surface text-foreground focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              disabled={profile.status === "PENDING_REVIEW"}
            />
          </div>

          {/* Categories with Years of Experience */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2.5">
              {isAr
                ? "تخصصات الصيانة وسنوات الخبرة لكل تخصص (اختر واحداً على الأقل)"
                : "Specialties & Years of Experience (select at least one)"}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map((c) => {
                const isSelected = profile.categories.some((wc) => wc.categoryId === c.id);
                const expYears =
                  profile.categories.find((wc) => wc.categoryId === c.id)?.experienceYears || 0;

                return (
                  <div
                    key={c.id}
                    className="p-3.5 border border-line rounded-xl bg-surface-muted/40 space-y-2.5"
                  >
                    <label className="flex items-center gap-2.5 text-xs font-bold text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        name="categoryIds"
                        value={c.id}
                        defaultChecked={isSelected}
                        disabled={profile.status === "PENDING_REVIEW"}
                        className="rounded accent-teal-600 w-4 h-4 cursor-pointer"
                      />
                      <span>
                        {isAr ? c.nameAr : c.nameEn} ({c.nameEn})
                      </span>
                    </label>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-400">{isAr ? "سنوات الخبرة:" : "Years exp:"}</span>
                      <input
                        type="number"
                        name={`exp_${c.id}`}
                        defaultValue={expYears}
                        min={0}
                        max={50}
                        disabled={profile.status === "PENDING_REVIEW"}
                        className="w-20 px-2.5 py-1 text-xs border border-line rounded-lg bg-surface text-foreground font-mono"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Service Areas */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-2">
              {isAr ? "مناطق الخدمة التي تغطيها" : "Service Coverage Areas"}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {areas.map((a) => {
                const isSelected = profile.areas.some((wa) => wa.areaId === a.id);
                return (
                  <label
                    key={a.id}
                    className="p-3 border border-line rounded-xl text-xs flex items-center gap-2 bg-surface-muted/30 cursor-pointer hover:bg-surface-muted/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      name="areaIds"
                      value={a.id}
                      defaultChecked={isSelected}
                      disabled={profile.status === "PENDING_REVIEW"}
                      className="rounded accent-teal-600 w-4 h-4 cursor-pointer"
                    />
                    <span className="font-semibold text-foreground">
                      {isAr ? a.nameAr : a.nameEn}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {profile.status !== "PENDING_REVIEW" && (
            <button
              type="submit"
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              {isAr ? "حفظ التعديلات في المسودة" : "Save Changes as Draft"}
            </button>
          )}
        </form>

        {/* Evidence & Certificates Section */}
        <div className="pt-6 border-t border-line space-y-4">
          <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
            {isAr ? "نماذج الأعمال وشهادات الخبرة والتدريب" : "Work Samples & Verified Certificates"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {profile.evidences.map((e) => (
              <div
                key={e.id}
                className="p-3 border border-line rounded-xl text-xs bg-surface-muted/30 space-y-0.5"
              >
                <span className="font-bold block text-foreground">
                  {e.kind === "PORTFOLIO"
                    ? (isAr ? "🖼️ نموذج عمل" : "🖼️ Portfolio")
                    : (isAr ? "📜 شهادة / تدريب" : "📜 Certificate")}
                </span>
                <span className="text-zinc-400">{e.caption}</span>
              </div>
            ))}
          </div>

          {profile.status !== "PENDING_REVIEW" && (
            <div className="flex flex-wrap gap-2.5 pt-2">
              <form action={handleAddMockEvidence} className="flex gap-2">
                <input type="hidden" name="kind" value="PORTFOLIO" />
                <input
                  name="caption"
                  placeholder={isAr ? "وصف نموذج العمل" : "Work sample title"}
                  className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {isAr ? "+ إضافة صورة عمل" : "+ Add Portfolio"}
                </button>
              </form>

              <form action={handleAddMockEvidence} className="flex gap-2">
                <input type="hidden" name="kind" value="CERTIFICATE" />
                <input
                  name="caption"
                  placeholder={isAr ? "اسم الشهادة أو الدورة" : "Certificate name"}
                  className="px-3 py-1.5 text-xs border border-line rounded-lg bg-surface text-foreground"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-900 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {isAr ? "+ إضافة شهادة" : "+ Add Certificate"}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Submit Application Button */}
        {profile.status !== "PENDING_REVIEW" && profile.status !== "APPROVED" && (
          <div className="pt-4 border-t border-line">
            <form action={handleSubmitApp}>
              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all cursor-pointer"
              >
                {isAr ? "إرسال الملف المهني للمراجعة والاعتماد رسميّاً 🚀" : "Submit Credentials for Official Verification 🚀"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
