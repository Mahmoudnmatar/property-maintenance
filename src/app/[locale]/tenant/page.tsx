import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function TenantRootPage() {
  const locale = await getLocale();
  redirect({ href: "/tenant/home", locale: locale as "ar" | "en" });
}
