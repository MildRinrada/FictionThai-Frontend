import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Cover } from "@/components/fiction/cover";
import { FormatBadges } from "@/components/fiction/format-badges";
import { PageContainer } from "@/components/shell/page-container";
import { Icon } from "@/components/ui/icon";
import { serverGetMany } from "@/lib/api-server";
import { getCurrentUserOrNull } from "@/lib/auth";
import { count, relativeTime } from "@/lib/format";
import type { Novel } from "@/types/novel";

/**
 * The studio index - the writer's list of their own work.
 *
 * The studio is deliberately scoped to ONE fiction at a time (docs/06 §33): a
 * writer working on a chapter should see that story's chapters, that story's
 * readers, and nothing else. This page exists only to choose which story to
 * enter, and to start a new one.
 *
 * Fetched WITH credentials, so it includes the caller's drafts and private
 * work. The API decides what that is; nothing here re-derives visibility
 * (docs/11 §31).
 */

export const metadata: Metadata = {
  title: "สตูดิโอ",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  ongoing: "กำลังเผยแพร่",
  completed: "จบแล้ว",
  hiatus: "พักการเผยแพร่",
  cancelled: "ยกเลิก",
};

export default async function StudioIndexPage() {
  const user = await getCurrentUserOrNull();
  if (!user) {
    redirect("/login?next=/studio");
  }

  const [novels, coWriting] = await Promise.all([
    serverGetMany<Novel>("/novels", {
      query: { author: user.username, per_page: 50, sort: "updated" },
    })
      .then((result) => result.items)
      .catch(() => [] as Novel[]),
    // เรื่องที่เขียนร่วม (13U): fictions where this user is a collaborator.
    serverGetMany<Novel>("/novels", {
      query: { co_writer: "me", per_page: 50, sort: "updated" },
    })
      .then((result) => result.items)
      .catch(() => [] as Novel[]),
  ]);

  return (
    <main id="main">
      <PageContainer className="py-10 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
              สตูดิโอของ {user.display_name ?? user.username}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              เลือกเรื่องที่ต้องการทำงาน - แต่ละเรื่องมีสตูดิโอของตัวเอง
            </p>
          </div>

          <Link
            href="/studio/novels/new"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
          >
            <Icon name="plus" size={17} />
            สร้างผลงาน
          </Link>
        </div>

        {novels.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="font-serif text-lg font-semibold">ยังไม่มีเรื่องในสตูดิโอ</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              เรื่องแรกเริ่มจากชื่อเรื่องอย่างเดียวก็ได้ รูปแบบการเขียนและการเผยแพร่
              ปรับได้ตลอดโดยไม่กระทบเนื้อหาที่เขียนไว้แล้ว
            </p>
            <Link
              href="/studio/novels/new"
              className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            >
              เริ่มเรื่องแรก
            </Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {novels.map((novel) => (
              <li key={novel.id}>
                <StudioCard novel={novel} />
              </li>
            ))}
          </ul>
        )}

        {/* เรื่องที่เขียนร่วม (13U): stories whose owners added this writer as
            a collaborator. The same card, its own shelf - co-writing is real
            work, but not the same shelf as ownership. */}
        {coWriting.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 font-serif text-xl font-semibold tracking-tight">
              เรื่องที่คุณเขียนร่วม · {count(coWriting.length)}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {coWriting.map((novel) => (
                <li key={novel.id}>
                  <StudioCard
                    novel={novel}
                    note={`ของ ${novel.author.display_name ?? novel.author.username}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageContainer>
    </main>
  );
}

function StudioCard({ novel, note }: { novel: Novel; note?: string }) {
  // For an editor-view row chapter_count is EVERY chapter; the published
  // number is the difference - the same arithmetic the per-novel rail uses,
  // so the two screens cannot disagree.
  const drafts = novel.draft_chapter_count ?? 0;
  const published = Math.max(0, novel.chapter_count - drafts);

  return (
    <Link
      href={`/studio/novels/${encodeURIComponent(novel.slug)}`}
      className="group flex gap-4 rounded-lg border border-border bg-surface p-4 hover:border-primary-200"
    >
      <Cover url={novel.cover_url} title={novel.title} className="w-16" />

      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-base font-semibold group-hover:text-primary">
          {novel.title}
        </span>

        <span className="mt-1 block text-xs text-text-muted">
          {note ? `${note} · ` : ""}
          {STATUS_LABELS[novel.status] ?? novel.status}
          {" · "}
          เผยแพร่แล้ว {count(published)} ตอน
          {drafts ? ` · ร่าง ${count(drafts)}` : ""}
        </span>

        <span className="mt-2.5 block">
          <FormatBadges format={novel} />
        </span>

        <span className="mt-2.5 block text-xs text-text-muted">
          แก้ไขล่าสุด {relativeTime(novel.updated_at)}
        </span>
      </span>
    </Link>
  );
}
