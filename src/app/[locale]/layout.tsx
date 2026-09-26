import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Navbar } from "@/components/Navbar";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as "ar" | "en")) {
    notFound();
  }

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div
      lang={locale}
      dir={dir}
      className="min-h-screen flex flex-col font-sans text-foreground selection:bg-teal-500/20"
    >
      <NextIntlClientProvider messages={messages}>
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-6 sm:px-6 max-w-7xl">
          {children}
        </main>
        <footer className="border-t border-line py-6 text-center text-xs text-zinc-500 dark:text-zinc-400 bg-surface/50 backdrop-blur-xs mt-auto">
          <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>منصة صيانة العقارات الشاملة · Property Maintenance Marketplace</span>
            <span>© {new Date().getFullYear()} جميع الحقوق محفوظة</span>
          </div>
        </footer>
      </NextIntlClientProvider>
    </div>
  );
}
