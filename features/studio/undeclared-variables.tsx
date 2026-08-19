"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { chapterLabel } from "@/lib/format";
import { saveVariables } from "@/lib/novels-client";
import {
  type NovelVariable,
  type TokenUse,
  VARIABLE_PRESETS,
  type VariableInput,
} from "@/types/variable";

/**
 * ตัวแปรที่ยังไม่ประกาศ (§13T, extended after review).
 *
 * The variable system's quietest failure, surfaced where the writer will see
 * it - and now actionable where it is surfaced. The review named the two
 * things the plain alert made the writer do by hand:
 *
 *   - hunt for WHERE the token was typed. The report now carries the chapters
 *     each token appears in (the API scans them anyway), so every token links
 *     straight to its chapters.
 *
 *   - walk to the settings page and retype the token to declare it. The
 *     ประกาศเลย button appends the declaration in one press: a preset token
 *     like (y/n) gets its known label and kind, anything else becomes a text
 *     variable named after itself - refinable later in settings, which stays
 *     one link away for exactly that.
 *
 * Declaring here REPLACES the whole list, same as the settings table does
 * (docs/09: order is the declaration order) - the existing declarations are
 * passed in and sent back unchanged with the new row appended. It writes no
 * chapter content: declaring is what makes the token start working.
 */

/** How many chapter links a row shows before summarising the rest. */
const MAX_CHAPTER_LINKS = 4;

/** The declaration one press creates for a token. */
function declarationFor(token: string): VariableInput {
  const preset = VARIABLE_PRESETS.find((entry) => entry.input.token === token);
  if (preset) return preset.input;
  return { token, label: token, kind: "text" };
}

export function UndeclaredVariables({
  novelRef,
  base,
  chapterUnit,
  declared,
  uses,
}: {
  novelRef: string;
  base: string;
  chapterUnit?: string;
  /** The fiction's current declarations, resent whole on a quick declare. */
  declared: NovelVariable[];
  /** The undeclared tokens with the chapters they were found in. */
  uses: TokenUse[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  /** Tokens declared in THIS session, hidden while the refresh catches up. */
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const pending = uses.filter((use) => !done.has(use.token));
  if (pending.length === 0) return null;

  async function declare(token: string) {
    setSaving(token);
    setError(null);
    try {
      const inputs: VariableInput[] = declared.map((variable) => ({
        token: variable.token,
        label: variable.label,
        default_value: variable.default_value ?? null,
        kind: variable.kind,
        options: variable.options ?? null,
      }));
      inputs.push(declarationFor(token));
      await saveVariables(novelRef, inputs);
      setDone((current) => new Set([...current, token]));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ประกาศตัวแปรไม่สำเร็จ");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      id="undeclared-variables"
      className="scroll-mt-24 rounded-lg border border-warning/30 bg-warning/8 p-4"
    >
      <p className="mono-label flex items-center gap-1.5">
        <Icon name="alert" size={14} />
        ตัวแปรที่ยังไม่ประกาศ
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        มีตอนที่ใช้ตัวแปรเหล่านี้ แต่ยังไม่ได้ประกาศไว้ -
        ผู้อ่านจะเห็นเป็นตัวอักษรดิบแทนที่จะถูกถาม
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      <ul className="mt-2.5 flex flex-col gap-2">
        {pending.map((use) => (
          <li
            key={use.token}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border bg-surface px-3 py-2"
          >
            <code className="shrink-0 font-mono text-xs">{use.token}</code>

            {use.chapters.length > 0 ? (
              <span className="min-w-0 flex-1 text-xs text-text-muted">
                พบใน:{" "}
                {use.chapters.slice(0, MAX_CHAPTER_LINKS).map((chapter, index) => (
                  <span key={chapter.slug}>
                    {index > 0 ? ", " : null}
                    <Link
                      href={`${base}/chapters/${encodeURIComponent(chapter.slug)}`}
                      className="text-primary hover:underline"
                    >
                      {chapter.title ??
                        chapterLabel(chapterUnit, chapter.chapter_number)}
                    </Link>
                  </span>
                ))}
                {use.chapters.length > MAX_CHAPTER_LINKS
                  ? ` และอีก ${use.chapters.length - MAX_CHAPTER_LINKS} ตอน`
                  : null}
              </span>
            ) : (
              <span className="min-w-0 flex-1" />
            )}

            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void declare(use.token)}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              <Icon name="plus" size={12} />
              {saving === use.token ? "กำลังประกาศ…" : "ประกาศเลย"}
            </button>
          </li>
        ))}
      </ul>

      {/* Only single-key tokens - (y/n) and kin - reach this box at all
          (settings review round 4): the scanner's pattern is one character a
          side, so a "(Scaramouche/Wanderer)" in the prose is prose. */}
      <p className="mt-2.5 text-xs text-text-muted">
        ประกาศเลย = สร้างเป็นตัวแปรข้อความชื่อเดียวกับโค้ดทันที -{" "}
        <Link href={`${base}/settings`} className="text-primary hover:underline">
          แก้คำถามและชนิดได้ที่ตั้งค่าเรื่อง
        </Link>
      </p>
    </div>
  );
}
