'use client';
import { useRouter, usePathname } from '@/i18n/routing';

export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (locale: 'ar' | 'en') => {
    router.replace(pathname, { locale });
  };

  return (
    <div className="flex gap-2">
      <button onClick={() => switchLocale('ar')} className="px-3 py-1 border rounded">العربية</button>
      <button onClick={() => switchLocale('en')} className="px-3 py-1 border rounded">English</button>
    </div>
  );
}
