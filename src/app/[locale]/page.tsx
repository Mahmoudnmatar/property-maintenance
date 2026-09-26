import { getTranslations, getLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/routing";
import { getCurrentUser } from "@/server/auth/actions";
import { Role } from "@prisma/client";

export default async function HomePage() {
  const t = await getTranslations("common");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();

  const user = await getCurrentUser();
  if (user) {
    redirect({ href: "/dashboard", locale: locale as "ar" | "en" });
  }

  const isAr = locale === "ar";

  return (
    <div className="py-12 md:py-20 flex flex-col items-center">
      {/* Hero Badge */}
      <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold border border-teal-500/20 mb-8 shadow-xs">
        <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
        <span>{isAr ? "المنصة الذكية لإدارة وصيانة العقارات" : "Smart Property Maintenance Platform"}</span>
        <span className="text-zinc-400">·</span>
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          {isAr ? "شيكل · ILS" : "ILS Currency"}
        </span>
      </div>

      {/* Hero Title */}
      <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight max-w-4xl text-center text-zinc-900 dark:text-zinc-50 leading-tight">
        {isAr ? (
          <>
            إدارة صيانة العقارات بكل{" "}
            <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
              شفافية وسلاسة
            </span>
          </>
        ) : (
          <>
            Property Maintenance with{" "}
            <span className="bg-gradient-to-r from-teal-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent">
              Total Transparency
            </span>
          </>
        )}
      </h1>

      <p className="mt-5 text-base md:text-xl text-zinc-600 dark:text-zinc-300 max-w-2xl text-center leading-relaxed font-normal">
        {isAr
          ? "منصة متكاملة تجمع أصحاب العقارات، المستأجرين، والفنيين المعتمدين لتوثيق البلاغات، استدراج عروض الأسعار، وتأكيد الإنجاز بدقة واحترافية."
          : "Connect property owners, tenants, and verified technicians for maintenance requests, competitive tenders, and certified job completion."}
      </p>

      {/* CTA Buttons */}
      <div className="mt-10 flex flex-wrap gap-4 justify-center">
        <Link
          href="/register"
          className="px-7 py-3.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all text-sm flex items-center gap-2 cursor-pointer"
        >
          <span>{t("register")}</span>
          <span>{isAr ? "←" : "→"}</span>
        </Link>
        <Link
          href="/login"
          className="px-7 py-3.5 bg-surface hover:bg-surface-muted text-foreground font-semibold rounded-xl border border-line shadow-xs hover:border-teal-500/40 transition-all text-sm cursor-pointer"
        >
          {t("login")}
        </Link>
      </div>

      {/* Role Showcase Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl mt-16 text-start">
        {/* Owner Card */}
        <div className="card-elevated p-7 rounded-2xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
            🏢
          </div>
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
            {tRoles(Role.OWNER)}
          </span>
          <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-100 mt-1">
            {isAr ? "إدارة العقارات والمناقصات" : "Property & Tender Control"}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed">
            {isAr
              ? "إضافة المباني والوحدات، توليد رموز انضمام المستأجرين، استدراج عروض الأسعار، اعتماد الفنيين، وتوثيق سجل الدفعات النقدية."
              : "Manage buildings, generate tenant join codes, launch competitive tenders, award quotes, and track external payments."}
          </p>
          <div className="mt-6 pt-4 border-t border-line">
            <Link
              href="/register"
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1"
            >
              <span>{isAr ? "تسجيل كصاحب عقار" : "Register as Owner"}</span>
              <span>{isAr ? "←" : "→"}</span>
            </Link>
          </div>
        </div>

        {/* Tenant Card */}
        <div className="card-elevated p-7 rounded-2xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
            🏠
          </div>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            {tRoles(Role.TENANT)}
          </span>
          <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-100 mt-1">
            {isAr ? "بلاغات سريعة وتأكيد إنجاز" : "Instant Fault Reports"}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed">
            {isAr
              ? "الانضمام برمز المبنى لشقتك أو محلك، رفع بلاغات الصيانة، متابعة حضور الفني، تأكيد الرضا أو طلب تعديل، وتقييم الفني."
              : "Join your unit using building code, report maintenance issues, track progress, confirm quality, and review workers."}
          </p>
          <div className="mt-6 pt-4 border-t border-line">
            <Link
              href="/register"
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
            >
              <span>{isAr ? "تسجيل كمستأجر" : "Register as Tenant"}</span>
              <span>{isAr ? "←" : "→"}</span>
            </Link>
          </div>
        </div>

        {/* Worker Card */}
        <div className="card-elevated p-7 rounded-2xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
            🔧
          </div>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            {tRoles(Role.WORKER)}
          </span>
          <h3 className="font-bold text-xl text-zinc-900 dark:text-zinc-100 mt-1">
            {isAr ? "اعتماد رسمي وفرص عمل" : "Verified Worker Marketplace"}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2.5 leading-relaxed">
            {isAr
              ? "ملف مهني موثق بالشهادات وسنوات الخبرة، منافسة في مناقصات الصيانة، تقديم عروض أسعار دقيقة، وبناء سمعة موثوقة بالتقييمات."
              : "Verified credentials with certificates and experience, submit competitive price offers, and build a trusted reputation."}
          </p>
          <div className="mt-6 pt-4 border-t border-line">
            <Link
              href="/register"
              className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1"
            >
              <span>{isAr ? "انضمام كفني صيانة" : "Join as Technician"}</span>
              <span>{isAr ? "←" : "→"}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Feature Highlights Section */}
      <div className="mt-20 w-full max-w-5xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "لماذا تختار منصتنا لإدارة الصيانة؟" : "Platform Key Features"}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {isAr
              ? "صممت وفق أفضل الممارسات لضمان حقوق كافة الأطراف وسرعة إنجاز الأعمال"
              : "Engineered for compliance, transparency, and high performance."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-elevated p-5 rounded-xl">
            <span className="text-2xl mb-2 block">⚖️</span>
            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {isAr ? "مناقصات وعروض أسعار" : "Competitive Bids"}
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isAr
                ? "إمكانية استدراج عروض مباشرة أو طرح مناقصة لاختيار السعر والضمان الأنسب."
                : "Direct quoting or public tenders to secure fair pricing and scope."}
            </p>
          </div>

          <div className="card-elevated p-5 rounded-xl">
            <span className="text-2xl mb-2 block">🛡️</span>
            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {isAr ? "اعتماد وفحص الشهادات" : "Admin Worker Vetting"}
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isAr
                ? "فحص يدوي للتخصصات والشهادات من إدارة النظام مع تقييم مهني (1-5 نجوم)."
                : "Manual credential audits, portfolio reviews, and admin ratings."}
            </p>
          </div>

          <div className="card-elevated p-5 rounded-xl">
            <span className="text-2xl mb-2 block">✍️</span>
            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {isAr ? "تأكيد إنجاز المستأجر" : "Tenant Confirmation"}
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isAr
                ? "لا يمكن إغلاق البلاغ حتى يفحص المستأجر العمل ويؤكد الإنجاز أو يطلب إعادة العمل."
                : "Jobs cannot be closed until tenant verifies work or requests rework."}
            </p>
          </div>

          <div className="card-elevated p-5 rounded-xl">
            <span className="text-2xl mb-2 block">💰</span>
            <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
              {isAr ? "سجل دفعات دقيق (شيكل)" : "Exact ILS Accounting"}
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {isAr
                ? "حساب دقيق بالأغورات يمنع التجاوز المالي ويوثق الدفعات الجزئية والكاملة."
                : "Integer agorot accounting with overpayment prevention and audit log."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
