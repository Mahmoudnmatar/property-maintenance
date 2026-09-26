"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { loginUser } from "@/server/auth/actions";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("email", email);
    formData.append("password", password);

    const res = await loginUser(formData);
    setLoading(false);

    if (res?.error) {
      setError(t("invalidCredentials"));
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  const setDemo = (userEmail: string) => {
    setEmail(userEmail);
    setPassword("Password123!");
  };

  return (
    <div className="max-w-md mx-auto my-10 card-elevated p-8 rounded-2xl shadow-md border border-line">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl mx-auto mb-3">
          🔐
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("loginTitle")}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t("loginSubtitle")}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm border border-rose-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
            {t("emailLabel")}
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground font-mono"
            placeholder="user@property.local"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
            {t("passwordLabel")}
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground pr-10"
              dir="ltr"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              className="absolute inset-y-0 left-3 flex items-center text-zinc-400 hover:text-teal-500 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {loading ? tCommon("loading") : tCommon("login")}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/register" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">
          {t("noAccount")}
        </Link>
      </div>

      {/* Quick Demo Credentials */}
      <div className="mt-8 pt-5 border-t border-line text-xs">
        <span className="font-bold text-zinc-500 dark:text-zinc-400 block mb-2.5 uppercase tracking-wider text-[11px]">
          ⚡ حسابات تجريبية سريعة (Demo Logins):
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDemo("owner1@property.local")}
            className="p-2.5 text-xs bg-teal-500/10 hover:bg-teal-500/20 text-teal-800 dark:text-teal-200 border border-teal-500/20 rounded-xl text-start font-medium transition-colors cursor-pointer"
          >
            🏢 طارق (صاحب عقار)
          </button>
          <button
            type="button"
            onClick={() => setDemo("tenant1@property.local")}
            className="p-2.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20 rounded-xl text-start font-medium transition-colors cursor-pointer"
          >
            🏠 أحمد (مستأجر)
          </button>
          <button
            type="button"
            onClick={() => setDemo("worker1@property.local")}
            className="p-2.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/20 rounded-xl text-start font-medium transition-colors cursor-pointer"
          >
            🔧 محمود (سباك معتمد)
          </button>
          <button
            type="button"
            onClick={() => setDemo("admin@property.local")}
            className="p-2.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-500/20 rounded-xl text-start font-medium transition-colors cursor-pointer"
          >
            🛡️ الأدمن (Super Admin)
          </button>
        </div>
      </div>
    </div>
  );
}
