import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PostForm } from "@/features/community/post-form";
import { getCurrentUserOrNull } from "@/lib/auth";

/**
 * The post composer - docs/03 §14 `/community/create`, "Authentication should
 * be required for posting." The redirect is the UX affordance; the API's
 * RequireAuth on the create endpoint is the actual protection (docs/07 §5).
 *
 * No email-verification gate: any signed-in user may post (docs/03 §27);
 * verification gates publishing fiction only.
 */

export const metadata: Metadata = {
  title: "เขียนโพสต์",
  robots: { index: false, follow: false },
};

export default async function CreatePostPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/community/create");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <nav aria-label="เส้นทาง" className="mb-6 text-sm">
        <Link href="/community" className="text-text-secondary hover:text-primary">
          ← กลับสู่ชุมชน
        </Link>
      </nav>

      <h1 className="mb-6 text-3xl font-bold tracking-tight">เขียนโพสต์</h1>

      <PostForm />
    </main>
  );
}
