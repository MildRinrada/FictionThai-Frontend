"use client";

import { count } from "@/lib/format";
import type { OutlineSection } from "@/lib/outline";

/**
 * สารบัญในตอนนี้ - the chapter's own table of contents (docs/EDITOR.md).
 *
 * Three facts per row, and each of them answers a question a writer asks while
 * revising a long chapter: what is in here, how much of it is there, and where
 * is the work left. The third one is why this sits beside the assistant rather
 * than replacing it - a panel that says "พบ 43 จุด" tells a writer there is a
 * lot to do; `จงหลี่ · 1,240 คำ · 6 จุด` tells them WHERE it is.
 *
 * It is a reading of the manuscript, never a change to it: clicking a row moves
 * the view, and nothing else. See `lib/outline.ts` for what counts as a heading
 * and why a bold line after a rule is one.
 */
export function ChapterOutline({
  sections,
  counts,
  activeKey,
  onJump,
  compact = false,
  emptyHint,
  countUnit = "คำ",
  emptyAction,
  assistantFooter = true,
}: {
  sections: OutlineSection[];
  /** Pending assistant findings per section, parallel to `sections`. */
  counts: number[];
  /** The section the view is currently in. */
  activeKey: string | null;
  onJump: (section: OutlineSection) => void;
  /** Rendered inside a disclosure rather than as a rail. */
  compact?: boolean;
  /**
   * What makes a section, said in this MODE's terms (layout-parity review
   * 2026-08): the prose recipe means nothing to a chat or headcanon writer.
   */
  emptyHint?: string;
  /** What a section's count counts - คำ for prose, ข้อความ for a chat. */
  countUnit?: string;
  /**
   * The empty state's one useful move (chat-editor review 2026-08, item 8):
   * a chat with no scenes yet offers "+ เพิ่มคั่นฉากแรก" instead of prose.
   */
  emptyAction?: { label: string; onAction: () => void };
  /**
   * Whether the assistant tally line renders. Off for chat and headcanon
   * (item 8): saying "ยังไม่มีจุดที่ผู้ช่วยเสนอ" twice on one screen is the
   * right panel's job done badly here.
   */
  assistantFooter?: boolean;
}) {
  if (sections.length === 0) {
    return (
      <div>
        <p className="text-xs leading-relaxed text-text-muted">
          {emptyHint ??
            "ตอนนี้ยังไม่มีหัวข้อ - คั่นฉากด้วยเส้น (ปุ่มคั่นฉาก) แล้วขึ้นบรรทัดชื่อตัวละครเป็นตัวหนา ระบบจะทำสารบัญให้เอง"}
        </p>
        {emptyAction ? (
          <button
            type="button"
            onClick={emptyAction.onAction}
            className="mt-2 inline-flex min-h-8 items-center rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            {emptyAction.label}
          </button>
        ) : null}
      </div>
    );
  }

  const total = counts.reduce((sum, value) => sum + value, 0);

  return (
    <nav aria-label="สารบัญในตอนนี้">
      {!compact ? (
        <p className="mono-label flex items-center justify-between gap-2">
          <span>สารบัญในตอนนี้</span>
          <span className="font-normal text-text-muted">{count(sections.length)} หัวข้อ</span>
        </p>
      ) : null}

      <ol className="mt-2 flex flex-col">
        {sections.map((section, at) => {
          const pending = counts[at] ?? 0;
          const active = section.key === activeKey;
          return (
            <li key={section.key}>
              <button
                type="button"
                onClick={() => onJump(section)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full flex-col gap-0.5 rounded-md border-s-2 py-1.5 pe-1.5 text-start ${
                  section.level === 3 ? "ps-4" : "ps-2.5"
                } ${
                  active
                    ? "border-s-primary bg-primary-50 text-text"
                    : "border-s-transparent text-text-secondary hover:border-s-border hover:bg-surface-secondary hover:text-text"
                }`}
              >
                <span className="line-clamp-2 text-[13px] leading-snug">
                  {section.title}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                  <span className="tabular-nums">
                    {count(section.words)} {countUnit}
                  </span>
                  {pending > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="flex items-center gap-0.5 text-warning">
                        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                        <span className="tabular-nums">{count(pending)}</span> จุด
                      </span>
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {/*
        The one number the list cannot show: whether the marks are anywhere at
        all. A writer who has just fixed the last one wants to be told, and a
        panel that only ever counts upward is a panel that only ever nags.
      */}
      {assistantFooter ? (
        <p className="mt-2 border-t border-hairline pt-2 text-[11px] text-text-muted">
          {total > 0
            ? `เหลือ ${count(total)} จุดที่ผู้ช่วยเสนอไว้ในตอนนี้`
            : "ยังไม่มีจุดที่ผู้ช่วยเสนอไว้ในตอนนี้"}
        </p>
      ) : null}
    </nav>
  );
}
