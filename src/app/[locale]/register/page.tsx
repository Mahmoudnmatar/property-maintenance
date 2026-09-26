"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/routing";
import { initiateRegistration } from "@/server/auth/actions";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("TENANT");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("role", role);

    const res = await initiateRegistration(formData);
    setLoading(false);

    if (res?.error) {
      const errorMessages: Record<string, string> = {
        EMAIL_ALREADY_EXISTS: t("emailAlreadyExists"),
        PASSWORD_TOO_SHORT: t("passwordTooShort"),
        EMAIL_SEND_FAILED: t("emailSendFailed"),
        INVALID_ROLE_SELF_REGISTRATION_RESTRICTED: t("invalidRole"),
      };
      setError(errorMessages[res.error] || res.error);
    } else if (res?.success) {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="max-w-md mx-auto my-10 card-elevated p-8 rounded-2xl shadow-md border border-line">
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-2xl mx-auto mb-3">
          ✨
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("registerTitle")}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t("registerSubtitle")}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 text-sm border border-rose-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
            {t("nameLabel")}
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 text-sm border border-line rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-surface text-foreground"
            placeholder="الاسم الكامل"
          />
        </div>

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
            placeholder="name@example.com"
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
              minLength={8}
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

        <div>
          <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
            {t("roleLabel")}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "TENANT", icon: "🏠", label: tRoles("TENANT") },
              { id: "OWNER", icon: "🏢", label: tRoles("OWNER") },
              { id: "WORKER", icon: "🔧", label: tRoles("WORKER") },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`p-3 border rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  role === r.id
                    ? "border-teal-600 bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500 font-bold shadow-xs"
                    : "border-line bg-surface-muted/40 hover:bg-surface-muted text-zinc-600 dark:text-zinc-400"
                }`}
              >
                <span className="text-xl">{r.icon}</span>
                <span className="text-xs">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm disabled:opacity-50 cursor-pointer pt-2"
        >
          {loading ? tCommon("loading") : tCommon("register")}
        </button>
      </form>

      <div className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/login" className="text-teal-600 dark:text-teal-400 font-semibold hover:underline">
          {t("haveAccount")}
        </Link>
      </div>
    </div>
  );
}
