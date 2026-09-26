import { Link, redirect } from "@/i18n/routing";
import { getTranslations, getLocale } from "next-intl/server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { getCurrentUser, logoutUser } from "@/server/auth/actions";
import { Role } from "@prisma/client";

export async function Navbar() {
  const t = await getTranslations("common");
  const tRoles = await getTranslations("roles");
  const locale = await getLocale();

  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;

  async function handleLogout() {
    "use server";
    await logoutUser();
    const currentLocale = await getLocale();
    redirect({ href: "/login", locale: currentLocale as "ar" | "en" });
  }

  const roleBadgeColors: Record<Role, string> = {
    [Role.SUPER_ADMIN]: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
    [Role.OWNER]: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    [Role.TENANT]: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    [Role.WORKER]: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  };

  return (
    <header className="sticky top-0 z-50 w-full glass-header">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 max-w-7xl">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-bold text-lg text-teal-700 dark:text-teal-400 hover:opacity-90 transition-opacity"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-teal-800 text-white shadow-sm text-base">
              🏢
            </span>
            <span className="font-extrabold tracking-tight">{t("appName")}</span>
          </Link>

          {/* Navigation Links based on role */}
          {user && (
            <nav className="hidden md:flex items-center gap-1 lg:gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
              <Link
                href="/dashboard"
                className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
              >
                {t("dashboard")}
              </Link>

              {role === Role.OWNER && (
                <>
                  <Link
                    href="/owner/buildings"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("buildings")}
                  </Link>
                  <Link
                    href="/owner/requests"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("requests")}
                  </Link>
                  <Link
                    href="/owner/payments"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("payments")}
                  </Link>
                  <Link
                    href="/owner/workers"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("workers")}
                  </Link>
                </>
              )}

              {role === Role.TENANT && (
                <>
                  <Link
                    href="/tenant/home"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    وحدتي السكنية
                  </Link>
                  <Link
                    href="/tenant/requests"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("requests")}
                  </Link>
                </>
              )}

              {role === Role.WORKER && (
                <>
                  <Link
                    href="/worker/profile"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("profile")}
                  </Link>
                  <Link
                    href="/worker/opportunities"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("opportunities")}
                  </Link>
                  <Link
                    href="/worker/offers"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("offers")}
                  </Link>
                  <Link
                    href="/worker/jobs"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("jobs")}
                  </Link>
                </>
              )}

              {role === Role.SUPER_ADMIN && (
                <>
                  <Link
                    href="/admin/workers"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    اعتماد الفنيين
                  </Link>
                  <Link
                    href="/admin/users"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("users")}
                  </Link>
                  <Link
                    href="/admin/requests"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("requests")}
                  </Link>
                  <Link
                    href="/admin/categories"
                    className="px-3 py-1.5 rounded-lg hover:text-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-colors"
                  >
                    {t("categories")}
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>

        {/* Right side items */}
        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-start">
                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{user.name}</span>
                {role && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border mt-0.5 w-fit ${roleBadgeColors[role]}`}
                  >
                    {tRoles(role)}
                  </span>
                )}
              </div>
              <form action={handleLogout}>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
                >
                  {t("logout")}
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:text-teal-600 transition-colors"
              >
                {t("login")}
              </Link>
              <Link
                href="/register"
                className="px-3.5 py-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors shadow-sm"
              >
                {t("register")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
