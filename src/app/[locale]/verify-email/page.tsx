"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";

export default function VerifyEmailPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return null;
}
