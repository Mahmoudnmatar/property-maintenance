import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role } from "@prisma/client";
import { getLocale } from "next-intl/server";

const roleLabels: Record<Role, { ar: string; en: string; badgeClass: string }> = {
  [Role.SUPER_ADMIN]: { ar: "مدير النظام", en: "Super Admin", badgeClass: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20" },
  [Role.OWNER]: { ar: "صاحب عقار", en: "Owner", badgeClass: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20" },
  [Role.TENANT]: { ar: "مستأجر", en: "Tenant", badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20" },
  [Role.WORKER]: { ar: "فني صيانة", en: "Technician", badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
};

export default async function AdminUsersPage() {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user || user.role !== Role.SUPER_ADMIN) {
    redirect({ href: "/login", locale: locale as "ar" | "en" });
    return null;
  }

  const isAr = locale === "ar";

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { workerProfile: { select: { status: true } } },
  });

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {isAr ? "دليل المستخدمين والحسابات" : "User Management Directory"}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isAr ? "كافة الحسابات المسجلة في المنصة وأدوارها وحالة النشاط" : "All registered platform accounts, roles, and status"}
          </p>
        </div>
        <Link
          href="/admin"
          className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold w-fit"
        >
          {isAr ? "← العودة للوحة الإدارة" : "← Admin Dashboard"}
        </Link>
      </div>

      <div className="card-elevated rounded-2xl overflow-hidden border border-line">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted border-b border-line text-xs font-semibold text-zinc-500 uppercase tracking-wider text-start">
              <tr>
                <th className="p-4 text-start">{isAr ? "الاسم" : "Name"}</th>
                <th className="p-4 text-start">{isAr ? "البريد الإلكتروني" : "Email"}</th>
                <th className="p-4 text-start">{isAr ? "نوع الحساب (الدور)" : "Role"}</th>
                <th className="p-4 text-start">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-4 text-start">{isAr ? "حالة الاعتماد الفني" : "Worker Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((item) => {
                const roleMeta = roleLabels[item.role] || {
                  ar: item.role,
                  en: item.role,
                  badgeClass: "bg-surface-muted text-foreground border-line",
                };

                return (
                  <tr key={item.id} className="hover:bg-surface-muted/40 transition-colors">
                    <td className="p-4 font-bold text-foreground">{item.name}</td>
                    <td className="p-4 font-mono text-xs text-zinc-500" dir="ltr">
                      {item.email}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg border ${roleMeta.badgeClass}`}>
                        {isAr ? roleMeta.ar : roleMeta.en}
                      </span>
                    </td>
                    <td className="p-4">
                      {item.isDisabled ? (
                        <span className="badge-status badge-danger text-xs">
                          {isAr ? "معطل" : "Disabled"}
                        </span>
                      ) : (
                        <span className="badge-status badge-completed text-xs">
                          {isAr ? "نشط ومفعل" : "Active"}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {item.workerProfile ? (
                        <span className="badge-status badge-procurement text-[11px]">
                          {item.workerProfile.status}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
