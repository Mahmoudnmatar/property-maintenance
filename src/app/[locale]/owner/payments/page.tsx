import { getCurrentUser } from "@/server/auth/actions";
import { redirect } from "@/i18n/routing";
import { getOwnerPaymentsSummary, recordExternalPayment, formatIls, derivePaymentStatus } from "@/server/services/payments";
import { revalidatePath } from "next/cache";
import { Link } from "@/i18n/routing";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";

export default async function OwnerPaymentsPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.OWNER && user.role !== Role.SUPER_ADMIN)) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";
  const jobs = await getOwnerPaymentsSummary(user);

  async function handleRecordPayment(formData: FormData) {
    "use server";
    const cu = await getCurrentUser();
    if (!cu) return;

    const workOrderId = formData.get("workOrderId") as string;
    const paidIls = parseFloat(formData.get("paidAmount") as string);
    const ref = formData.get("ref") as string;
    const note = formData.get("note") as string;

    if (workOrderId && !isNaN(paidIls)) {
      await recordExternalPayment(cu, workOrderId, {
        cumulativePaidAgorot: Math.round(paidIls * 100),
        reference: ref || undefined,
        note: note || undefined,
      });
      revalidatePath("/[locale]/owner/payments", "page");
    }
  }

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "سجل الدفعات والمحاسبة المالية" : "Payments & Accounting Ledger"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr
              ? "تسجيل المبالغ المسددة نقدياً للفنيين وحساب حالة السداد (غير مدفوع، جزئي، مدفوع بالكامل)"
              : "Track external cash payments to technicians and compute real-time settlement status"}
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة التحكم" : "← Back to Dashboard"}
        </Link>
      </div>

      <div className="space-y-4">
        {jobs.length === 0 ? (
          <div className="card-elevated p-12 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2 rounded-2xl">
            <span className="text-3xl block">💰</span>
            <p>{isAr ? "لا توجد مهام صيانة معتمدة بحاجة لتسجيل دفعات حالياً." : "No awarded work orders needing payment records right now."}</p>
          </div>
        ) : (
          jobs.map((job) => {
            const paidAgorot = job.paymentRecord?.paidAgorot || 0;
            const agreedAgorot = job.agreedAmountAgorot;
            const status = derivePaymentStatus(paidAgorot, agreedAgorot);

            const badgeClass =
              status === "PAID"
                ? "badge-completed"
                : status === "PARTIALLY_PAID"
                  ? "badge-pending"
                  : "badge-danger";

            return (
              <div key={job.id} className="card-elevated p-6 rounded-2xl space-y-5">
                <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 gap-2">
                  <div>
                    <Link
                      href={`/requests/${job.requestId}`}
                      className="font-bold text-base hover:text-teal-600 transition-colors"
                    >
                      {job.request.title}
                    </Link>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex flex-wrap gap-2">
                      <span className="font-semibold text-foreground">
                        {job.request.unit.building.nameEn}
                      </span>
                      <span>·</span>
                      <span>وحدة {job.request.unit.label}</span>
                      <span>·</span>
                      <span className="text-teal-600 dark:text-teal-400 font-semibold">
                        {isAr ? "الفني:" : "Worker:"} {job.worker.name}
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span className={`badge-status ${badgeClass} text-xs`}>
                    {status === "PAID"
                      ? (isAr ? "✅ مدفوع بالكامل" : "✅ Fully Paid")
                      : status === "PARTIALLY_PAID"
                        ? (isAr ? "⏳ مدفوع جزئياً" : "⏳ Partially Paid")
                        : (isAr ? "❌ غير مدفوع" : "❌ Unpaid")}
                  </span>
                </div>

                {/* Amount breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-surface-muted/60 p-4 rounded-xl border border-line">
                  <div>
                    <span className="text-zinc-400 block mb-1">
                      {isAr ? "المبلغ الإجمالي المتفق عليه:" : "Total Agreed:"}
                    </span>
                    <span className="font-extrabold text-base text-foreground">
                      {formatIls(agreedAgorot)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block mb-1">
                      {isAr ? "المسدد تراكمياً:" : "Total Paid:"}
                    </span>
                    <span className="font-extrabold text-base text-teal-600 dark:text-teal-400">
                      {formatIls(paidAgorot)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block mb-1">
                      {isAr ? "المبلغ المتبقي:" : "Remaining Balance:"}
                    </span>
                    <span className="font-extrabold text-base text-amber-600 dark:text-amber-400">
                      {formatIls(Math.max(0, agreedAgorot - paidAgorot))}
                    </span>
                  </div>
                </div>

                {/* Form to update payment */}
                <form action={handleRecordPayment} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
                  <input type="hidden" name="workOrderId" value={job.id} />

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      {isAr ? "المسدد الإجمالي (شيكل)" : "Cumulative Paid (ILS)"}
                    </label>
                    <input
                      name="paidAmount"
                      type="number"
                      step="0.5"
                      min="0"
                      max={(agreedAgorot / 100).toFixed(2)}
                      defaultValue={(paidAgorot / 100).toFixed(2)}
                      required
                      className="w-full px-3 py-2 text-sm border border-line rounded-xl bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      {isAr ? "رقم السند / الإيصال" : "Receipt / Reference"}
                    </label>
                    <input
                      name="ref"
                      placeholder={isAr ? "مثال: REC-102" : "e.g. REC-102"}
                      defaultValue={job.paymentRecord?.lastPaymentRef || ""}
                      className="w-full px-3 py-2 text-sm border border-line rounded-xl bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      {isAr ? "ملاحظة الدفعة" : "Payment Note"}
                    </label>
                    <input
                      name="note"
                      placeholder={isAr ? "مثال: تسليم كاش باليد" : "e.g. Paid in cash"}
                      defaultValue={job.paymentRecord?.note || ""}
                      className="w-full px-3 py-2 text-sm border border-line rounded-xl bg-surface focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      {isAr ? "تحديث الدفعة الحالية" : "Update Payment"}
                    </button>
                  </div>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
