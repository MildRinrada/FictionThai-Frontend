import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUserOrNull } from "@/lib/auth";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
  // A sign-in page has no business in search results.
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  // Convenience only. This is NOT an access-control decision - the API
  // authorizes every protected operation regardless of what this page renders
  // (docs/11 §43).
  if (await getCurrentUserOrNull()) {
    redirect("/");
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">เข้าสู่ระบบ</h1>
      <p className="mb-8 text-sm text-text-secondary">
        ยินดีต้อนรับกลับมา
      </p>

      <LoginForm />

      <div className="mt-6 space-y-2 text-sm">
        <p className="text-text-secondary">
          ยังไม่มีบัญชี?{" "}
          <Link href="/register" className="text-primary hover:underline">
            สร้างบัญชีใหม่
          </Link>
        </p>
        <p className="text-text-secondary">
          <Link href="/forgot-password" className="text-primary hover:underline">
            ลืมรหัสผ่าน?
          </Link>
        </p>
      </div>

      {/* Guest-first: reading never requires an account (docs/10 §2.1). */}
      <p className="mt-8 text-xs text-text-muted">
        คุณสามารถ{" "}
        <Link href="/" className="underline">
          อ่านนิยายได้โดยไม่ต้องเข้าสู่ระบบ
        </Link>
      </p>
    </>
  );
}
