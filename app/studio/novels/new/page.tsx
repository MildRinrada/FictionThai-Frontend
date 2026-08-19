import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateNovelLoader } from "@/features/novels/create-novel-loader";
import { serverGetOne } from "@/lib/api-server";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * Writer Studio - create a fiction (docs/03 §19 `/studio/novels/new`).
 *
 * The redirect below is a UX affordance, NOT access control: a signed-out
 * visitor is sent somewhere useful instead of being shown a form that would
 * fail. The API rejects an unauthenticated POST regardless, which is where the
 * actual protection lives (docs/07 §5, docs/11 §43).
 */

export const metadata: Metadata = {
  title: "สร้างนิยายใหม่",
  // docs/11 §31 keeps drafts out of search; the studio is private by nature, so
  // it stays out of the index entirely.
  robots: { index: false, follow: false },
};

/**
 * Whether the writer has a support link at all (13V). The donate switch in the
 * form is dead without one, and says so with a link to set it up.
 */
async function hasDonationLink(): Promise<boolean> {
  try {
    const profile = await serverGetOne<{ donation_url?: string }>("/me/author-profile");
    return Boolean(profile.donation_url);
  } catch {
    return false;
  }
}

export default async function NewNovelPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/studio/novels/new");
  }
  const donationLinkSet = await hasDonationLink();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      {/* ONE exit, and it matches the form's own (13U): the writer came from
          the studio, so that is where "back" goes. */}
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/studio" className="text-text-secondary hover:text-primary">
          ← กลับไปที่สตูดิโอ
        </Link>
      </nav>

      <h1 className="mb-2 text-2xl font-semibold">สร้างนิยายใหม่</h1>
      {/* ONE sentence (create review item 10): the per-chapter-mode detail
          moved to the format question's own note, where it applies. */}
      <p className="mb-8 text-sm text-text-secondary">
        ตอบสั้น ๆ ไม่กี่ข้อแล้วเริ่มเขียนได้เลย - ทุกอย่างเปลี่ยนภายหลังได้
      </p>

      {!user.email_verified ? (
        <p className="mb-8 rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          คุณยังไม่ได้ยืนยันอีเมล สร้างและเขียนฉบับร่างได้ตามปกติ
          แต่ต้องยืนยันอีเมลก่อนเผยแพร่ผลงาน
        </p>
      ) : null}

      <CreateNovelLoader username={user.username} hasDonationLink={donationLinkSet} />
    </main>
  );
}
