import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RegisterForm } from "@/features/auth/register-form";
import { getCurrentUserOrNull } from "@/lib/auth";

export const metadata: Metadata = {
  title: "สร้างบัญชี",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  if (await getCurrentUserOrNull()) {
    redirect("/");
  }

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">สร้างบัญชี</h1>
      <p className="mb-8 text-sm text-text-secondary">
        เราขอเพียงข้อมูลที่จำเป็นต่อการใช้งานเท่านั้น
      </p>

      <RegisterForm />

      <p className="mt-6 text-sm text-text-secondary">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href="/login" className="text-primary hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </>
  );
}
