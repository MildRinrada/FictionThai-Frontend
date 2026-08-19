import Link from "next/link";
import { notFound } from "next/navigation";

import { StudioNav } from "@/components/studio/studio-nav";
import { StudioShell } from "@/components/studio/studio-shell";
import { Icon } from "@/components/ui/icon";
import { CommandPalette } from "@/features/studio/command-palette";
import { CoverEditor } from "@/features/studio/cover-editor";
import { EditableTitle } from "@/features/studio/editable-title";
import { tallyChapters, tallyLine } from "@/lib/chapter-tally";
import { decodeParam, fetchOwnerNovel, fetchOwnerChapters } from "@/lib/fiction-server";

/**
 * The per-novel studio shell.
 *
 * One studio per fiction (docs/06 §33). The rail names the story it belongs to
 * and never offers a way to switch - a writer moves between stories through
 * /studio, which keeps every screen inside unambiguously about one book.
 *
 * The layout also carries the ownership check. It is an affordance, not the
 * protection: every write is authorized by the API against the session
 * (docs/11 §43). A non-owner reaching this URL sees a 404 rather than a
 * "forbidden" page, so the existence of someone's private draft is not
 * confirmed (docs/11 §31).
 */
export default async function StudioNovelLayout({
  children,
  params,
}: LayoutProps<"/studio/novels/[ref]">) {
  const { ref } = await params;
  const novel = await fetchOwnerNovel(decodeParam(ref));
  // The studio opens for anyone who may EDIT: the owner or a collaborator
  // (13U). Ownership-only surfaces inside gate themselves off is_owner.
  if (!novel || !(novel.can_edit ?? novel.is_owner)) notFound();

  const base = `/studio/novels/${encodeURIComponent(novel.slug)}`;

  /*
   * The rail's counts come from the same owner chapter list the pages under it
   * use, through the same tally (§13T). The previous version printed the
   * novel's own `chapter_count` as "เผยแพร่แล้ว" - which for an owner is EVERY
   * chapter - so the rail could claim 8 published while the overview's card
   * correctly said 1. One source, one function, no third opinion.
   */
  const tally = tallyChapters(await fetchOwnerChapters(novel.slug));

  /*
   * The rail's content, handed to the shell that decides whether this screen
   * shows it at all - the chapter editor does not (editor review 2026-08 B).
   */
  const rail = (
    <>
      {/*
        The rail's own cover and title (§13S, cover review 2026-08).

        A cover that EXISTS links to its one editing home - ตั้งค่าเรื่อง ›
        ชื่อเรื่องและปก - because a modal opening from two pages read as two
        editors. A MISSING cover opens the dialog right here: filling in
        what the checklist is asking for is not editing. The title renames
        in place as before.
      */}
      <div className="flex gap-3">
        <CoverEditor
          novelRef={novel.slug}
          coverURL={novel.cover_url ?? null}
          className="w-14 shrink-0"
          editHref={`/studio/novels/${encodeURIComponent(novel.slug)}/settings#identity`}
        />
        <div className="min-w-0">
          <p className="mono-label">สตูดิโอของเรื่อง</p>
          <div className="mt-1">
            <EditableTitle
              novelRef={novel.slug}
              title={novel.title}
              as="p"
              className="font-serif text-sm font-semibold"
            />
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-text-muted">{tallyLine(tally)}</p>

      {/*
        One button, and it is the PREVIEW (§13T). The rail's เพิ่มตอน
        duplicated the button every page already shows top-right, so it
        went; seeing the story as a reader sees it is the studio's most
        pressed control and now reads like it.
      */}
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={`/novel/${encodeURIComponent(novel.slug)}`}
          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-white hover:opacity-90"
        >
          <Icon name="eye" size={16} />
          ดูตัวอย่างแบบผู้อ่าน
        </Link>
      </div>

      <StudioNav base={base} />

      <Link
        href="/studio"
        className="mt-5 inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary"
      >
        <Icon name="chevron-left" size={14} />
        เรื่องทั้งหมดของฉัน
      </Link>
    </>
  );

  return (
    <>
      <StudioShell rail={rail}>{children}</StudioShell>

      {/* Ctrl+K search across THIS fiction, drafts included (13Y §8). */}
      <CommandPalette novelRef={novel.slug} />
    </>
  );
}
