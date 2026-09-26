import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function OwnerRootPage() {
  const locale = await getLocale();
  redirect({ href: "/owner/buildings", locale: locale as "ar" | "en" });
}
