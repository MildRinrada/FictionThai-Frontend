import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DonationForm } from "@/features/author/donation-form";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * Writer Studio - author profile (Phase 11). The smallest surface for the one
 * field Phase 11 needs: the external writer-support (EasyDonate) link (brief §8).
 * The redirect is a UX affordance only; the API enforces auth independently.
 *
 * NOTE (documented gap): saving a donation link is the first author-profile
 * WRITE path in the codebase and creates the author_profiles row on demand. A
 * full author-registration / writer-onboarding flow remains out of scope
 * (docs/MONETIZATION.md, addendum §4).
 */

export const metadata: Metadata = {
  title: "โปรไฟล์นักเขียน",
  robots: { index: false, follow: false },
};

export default async function StudioAuthorPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/studio/author");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/" className="text-text-secondary hover:text-primary">
          ← กลับหน้าแรก
        </Link>
      </nav>

      <h1 className="mb-2 text-2xl font-semibold">โปรไฟล์นักเขียน</h1>
      <p className="mb-8 text-sm text-text-secondary">
        ตั้งค่าลิงก์รับการสนับสนุนของคุณ ผู้อ่านจะเห็นปุ่ม “สนับสนุนนักเขียน”
        บนหน้าเรื่องของคุณ
      </p>

      <DonationForm />
    </main>
  );
}
