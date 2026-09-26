import { redirect } from "@/i18n/routing";
import { getLocale } from "next-intl/server";

export default async function WorkerRootPage() {
  const locale = await getLocale();
  redirect({ href: "/worker/jobs", locale: locale as "ar" | "en" });
}
