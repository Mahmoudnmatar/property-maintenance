import { getCurrentUser } from "@/server/auth/actions";
import { prisma } from "@/server/db";
import { Link, redirect } from "@/i18n/routing";
import { Role } from "@prisma/client";

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.SUPER_ADMIN) {
    redirect({ href: "/login", locale: "ar" });
    return null;
  }

  const [userCount, pendingWorkers, requestCount, categoryCount] = await Promise.all([
    prisma.user.count(),
    prisma.workerProfile.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.maintenanceRequest.count(),
    prisma.serviceCategory.count(),
  ]);

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة المدير</h1>
        <p className="text-sm text-zinc-500 mt-1">نظرة شاملة على المستخدمين والفنيين والبلاغات وفئات الصيانة</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminCard href="/admin/users" label="المستخدمون" value={userCount} tone="teal" />
        <AdminCard href="/admin/workers" label="طلبات الفنيين" value={pendingWorkers} tone="amber" />
        <AdminCard href="/admin/requests" label="بلاغات الصيانة" value={requestCount} tone="blue" />
        <AdminCard href="/admin/categories" label="فئات الصيانة" value={categoryCount} tone="slate" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/admin/workers" className="p-5 rounded-xl bg-white dark:bg-zinc-950 border hover:border-teal-500 transition-colors">
          <h2 className="font-bold">مراجعة طلبات الفنيين</h2>
          <p className="text-sm text-zinc-500 mt-1">اعتماد الملفات المهنية وتقييم الخبرات.</p>
        </Link>
        <Link href="/admin/requests" className="p-5 rounded-xl bg-white dark:bg-zinc-950 border hover:border-teal-500 transition-colors">
          <h2 className="font-bold">مراقبة البلاغات</h2>
          <p className="text-sm text-zinc-500 mt-1">عرض حالة البلاغات وفتح تفاصيل أي بلاغ.</p>
        </Link>
      </div>
    </div>
  );
}

function AdminCard({ href, label, value, tone }: { href: string; label: string; value: number; tone: "teal" | "amber" | "blue" | "slate" }) {
  const colors = { teal: "text-teal-700", amber: "text-amber-700", blue: "text-blue-700", slate: "text-slate-700" };
  return <Link href={href} className="p-5 rounded-xl bg-white dark:bg-zinc-950 border hover:border-teal-500 transition-colors"><span className="text-sm text-zinc-500 block">{label}</span><strong className={`text-3xl mt-2 block ${colors[tone]}`}>{value}</strong><span className="text-xs text-zinc-400 mt-2 block">عرض القائمة ←</span></Link>;
}
