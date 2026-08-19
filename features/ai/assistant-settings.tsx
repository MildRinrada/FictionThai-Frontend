"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import {
  addLexiconTerm,
  getAiPrefs,
  getLexicon,
  removeLexiconTerm,
  setAiPrefs,
} from "@/lib/ai-client";
import type { AiLexicon, AiPrefs, AiPrefsView } from "@/types/ai";

/**
 * The assistant's settings (13Y §10, §12) - two of the three tiers.
 *
 * scope "account": the writer's defaults for every fiction, plus the master
 * switch that turns the whole assistant off, plus the platform's training
 * stance stated where it can be seen - not buried in terms.
 *
 * scope novel: one fiction's overrides (only what is SET here overrides the
 * account tier) plus its word bank.
 *
 * Reworked after review (2026-08):
 *
 *   - the toggles are SWITCHES: they take effect on flip, and a checkbox
 *     promises a submit that does not exist;
 *   - every flip answers with a "บันทึกแล้ว" flash - a setting that saves
 *     silently reads as a setting that did nothing;
 *   - the account view SAYS it is the default tier and names the fictions
 *     that override it, because the exact same switch list on two screens
 *     with no stated relationship is how writers stop trusting either.
 */

/**
 * The auto bank, grouped for reading (settings review item D).
 *
 * A character named "จงหลี่ (Zhongli)" seeds the bank with the full name and
 * its parts, so the raw list showed the same person twice with parentheses
 * echoing themselves. One entry per identity: "จงหลี่ · Zhongli", and a pair
 * whose halves are the same word collapses to the word.
 */
export function groupAutoTerms(auto: string[]): string[] {
  const covered = new Set<string>();
  const grouped: string[] = [];
  const singles: string[] = [];

  for (const term of auto) {
    const match = term.match(/^(.+?)\s*\((.+)\)$/);
    if (match) {
      const name = match[1].trim();
      const alias = match[2].trim();
      grouped.push(
        name.toLowerCase() === alias.toLowerCase() ? name : `${name} · ${alias}`,
      );
      covered.add(name.toLowerCase());
      covered.add(alias.toLowerCase());
    } else {
      singles.push(term);
    }
  }

  const seen = new Set<string>();
  return [...grouped, ...singles.filter((t) => !covered.has(t.toLowerCase()))].filter(
    (entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
  );
}

const SWITCHES: Array<{
  key: keyof AiPrefs;
  label: string;
  hint: string;
}> = [
  {
    key: "spell",
    label: "ตรวจคำผิดและไวยากรณ์",
    hint: "ตรวจสดระหว่างพิมพ์ (เมื่อหยุด ~1.5 วินาที)",
  },
  {
    key: "character",
    label: "ตรวจความสอดคล้องของตัวละคร",
    hint: "เทียบกับหน้าจัดการตัวละคร - ทุกคำเตือนอ้างอิงข้อมูลที่คุณกรอกไว้",
  },
  {
    key: "continuity",
    label: "ตรวจความต่อเนื่องของเนื้อเรื่อง",
    hint: "เทียบสมุดข้อเท็จจริงกับตอนก่อนหน้า - ตรวจรอบใหญ่ ไม่ใช่ตรวจสด",
  },
  {
    key: "polish",
    label: "เกลาภาษา",
    hint: "เสนอเท่านั้น ระดับอ่อนสุด - ไม่เสนอในบทสนทนาและโหมดแชท",
  },
];

export function AssistantSettings({ novelRef }: { novelRef?: string }) {
  const [view, setView] = useState<AiPrefsView | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lexicon, setLexicon] = useState<AiLexicon | null>(null);
  const [newTerm, setNewTerm] = useState("");
  const flashTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    getAiPrefs(novelRef)
      .then((loaded) => {
        if (alive) setView(loaded);
      })
      .catch(() => {
        if (alive) setError("โหลดการตั้งค่าไม่สำเร็จ");
      });
    if (novelRef) {
      getLexicon(novelRef)
        .then((bank) => {
          if (alive) setLexicon(bank);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [novelRef]);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // The tier this surface edits: account prefs, or this fiction's overrides.
  const tier = (novelRef ? view?.novel : view?.user) ?? {};

  async function save(changes: AiPrefs) {
    setSaving(true);
    setError(null);
    try {
      setView(await setAiPrefs({ ...tier, ...changes }, novelRef));
      // The flip is the save; this line is how the writer knows it took.
      setSavedFlash(true);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2400);
    } catch {
      setError("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function addTerm() {
    const term = newTerm.trim();
    if (!term || !novelRef) return;
    try {
      setLexicon(await addLexiconTerm(novelRef, term));
      setNewTerm("");
    } catch {
      setError("เพิ่มคำไม่สำเร็จ");
    }
  }

  async function removeTerm(termID: string) {
    if (!novelRef) return;
    try {
      await removeLexiconTerm(novelRef, termID);
      setLexicon(await getLexicon(novelRef));
    } catch {
      setError("ลบคำไม่สำเร็จ");
    }
  }

  if (view === null) {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-text-secondary">
        {error ?? "กำลังโหลดการตั้งค่าผู้ช่วย…"}
      </p>
    );
  }

  const masterOn = tier.assistant ?? view.effective.assistant;
  const overrides = view.overrides ?? [];

  return (
    <section
      // The overview's ผู้ช่วยเขียน link lands here (#assistant); scroll-mt
      // keeps the heading clear of the sticky header.
      id="assistant"
      aria-label="ตั้งค่าเครื่องมือช่วยเขียน"
      className="scroll-mt-24 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mono-label">เครื่องมือช่วยเขียน</p>
        {savedFlash ? (
          <span
            role="status"
            className="inline-flex items-center gap-1 text-xs text-success"
          >
            <Icon name="check" size={13} />
            บันทึกแล้ว
          </span>
        ) : null}
      </div>

      {/* What these values ARE (review §3): the same switch list appears on
          every fiction's settings page, and without this line the two screens
          look like duplicates rather than tiers. */}
      {!novelRef ? (
        <p className="mt-1 text-xs text-text-secondary">
          ค่าเหล่านี้ใช้กับทุกเรื่อง - แต่ละเรื่องปรับทับได้ที่หน้าตั้งค่าเรื่อง
        </p>
      ) : null}

      {/* The answer the audience most wants, said OUT LOUD (13Y §12; the
          settings review asked for it louder still - it is the platform's
          selling point, not fine print). */}
      <div className="mt-3 flex gap-2.5 rounded-md border border-primary-200 bg-primary-50 px-3.5 py-3 leading-relaxed">
        <Icon name="shield" size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-sm">
          <span className="font-semibold">งานของคุณไม่ถูกใช้ฝึก AI - ไม่มีข้อยกเว้น</span>
          <span className="mt-1 block text-xs text-text-secondary">
            การตรวจทำงานด้วยกฎบนเซิร์ฟเวอร์ของแพลตฟอร์ม ไม่ส่งเนื้อหาไปบริการภายนอก
            และไม่เก็บอะไรไว้หลังตอบกลับ ผู้ช่วยทุกตัว “เสนอ” เท่านั้น
            ไม่เขียนแทนและไม่แก้งานของคุณเอง
          </span>
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <Switch
          checked={masterOn}
          disabled={saving}
          onChange={(next) => void save({ assistant: next })}
        />
        <span>
          <span className="font-medium">
            เปิดผู้ช่วยเขียน{novelRef ? "ในเรื่องนี้" : "ทั้งบัญชี"}
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            ปิดแล้วทุกการตรวจหยุดทั้งหมด - การเขียนและบันทึกทำงานตามปกติ
          </span>
        </span>
      </label>

      <div className={`mt-3 flex flex-col gap-2.5 ${masterOn ? "" : "opacity-50"}`}>
        {SWITCHES.map((entry) => (
          <label key={entry.key} className="flex items-start gap-2.5 text-sm">
            <Switch
              checked={
                (tier[entry.key] as boolean | undefined) ??
                view.effective[entry.key as keyof typeof view.effective]
              }
              disabled={saving || !masterOn}
              onChange={(next) => void save({ [entry.key]: next })}
            />
            <span>
              {entry.label}
              <span className="mt-0.5 block text-xs text-text-muted">{entry.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {/* The completeness statement (settings review item D): the list above
          is ORDERED by how often each check speaks, and it is the whole list
          - nothing AI-driven runs without a switch here. */}
      <p className="mt-2 text-xs text-text-muted">
        นี่คือเครื่องมือทั้งหมดที่ทำงานกับเนื้อหาของคุณ -
        ไม่มีตัวไหนทำงานโดยไม่มีสวิตช์ในหน้านี้
        และเครื่องมือใหม่ในอนาคตจะมีสวิตช์ของตัวเองก่อนเปิดใช้เสมอ
      </p>
      {novelRef ? (
        <p className="mt-2 text-xs text-text-muted">
          ค่าที่ไม่ได้แตะในหน้านี้ใช้ตามการตั้งค่าบัญชี
        </p>
      ) : null}

      {/* Which stories do NOT follow these defaults (review §3), each linking
          to the settings page where its override lives. */}
      {!novelRef && overrides.length > 0 ? (
        <p className="mt-3 rounded-md bg-surface-secondary px-3 py-2 text-xs leading-relaxed text-text-secondary">
          มี {overrides.length} เรื่องที่ตั้งค่าทับไว้:{" "}
          {overrides.map((override, index) => (
            <span key={override.slug}>
              {index > 0 ? ", " : null}
              <Link
                href={`/studio/novels/${encodeURIComponent(override.slug)}/settings#assistant`}
                className="text-primary hover:underline"
              >
                {override.title}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {novelRef && lexicon ? (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mono-label">คลังคำของเรื่อง</p>
          <p className="mt-1 text-xs text-text-secondary">
            คำที่อยู่ในคลังจะไม่ถูกเตือนว่าสะกดผิด -
            ชื่อตัวละคร ตัวแปรผู้อ่าน แฟนด้อม และแท็ก ถูกเพิ่มให้อัตโนมัติ
            และเรื่องในซีรีส์เดียวกันใช้คลังร่วมกัน
          </p>

          <div className="mt-2 flex gap-2">
            <input
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void addTerm();
                }
              }}
              placeholder="เพิ่มคำ เช่น ชื่อเมืองที่คิดขึ้นเอง"
              aria-label="เพิ่มคำในคลัง"
              className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void addTerm()}
              disabled={newTerm.trim() === ""}
              className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 disabled:opacity-50"
            >
              เพิ่ม
            </button>
          </div>

          {lexicon.custom.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {lexicon.custom.map((term) => (
                <li key={term.id}>
                  <button
                    type="button"
                    onClick={() => void removeTerm(term.id)}
                    title="ลบออกจากคลัง"
                    className="inline-flex min-h-7 items-center gap-1 rounded-full border border-primary bg-primary-50 px-2.5 text-xs text-primary"
                  >
                    {term.term}
                    <Icon name="close" size={11} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* CHIPS, not a paragraph (settings review round 2, item 13): two
              lines of dot-joined words read as neither words nor explanation.
              Each bank says where its words come from and where they are
              managed - the auto bank is not deletable HERE because its words
              follow their sources (rename the character, the word follows). */}
          {(lexicon.account ?? []).length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-text-muted">
                จากคลังคำทั้งบัญชี ({(lexicon.account ?? []).length} คำ) -{" "}
                <Link href="/settings/ai" className="text-primary hover:underline">
                  จัดการที่ตั้งค่าผู้ช่วยเขียน
                </Link>
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {(lexicon.account ?? []).slice(0, 16).map((term) => (
                  <li
                    key={term.id}
                    className="inline-flex min-h-7 items-center rounded-full border border-border px-2.5 text-xs text-text-secondary"
                  >
                    {term.term}
                  </li>
                ))}
                {(lexicon.account ?? []).length > 16 ? (
                  <li className="inline-flex min-h-7 items-center px-1 text-xs text-text-muted">
                    +อีก {(lexicon.account ?? []).length - 16} คำ
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {lexicon.auto.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs text-text-muted">
                นำเข้าอัตโนมัติ ({lexicon.auto.length} คำ) จากตัวละคร ตัวแปรผู้อ่าน
                แฟนด้อม และแท็ก - แก้หรือลบได้ที่ต้นทางของคำนั้น
                ชื่อสองแบบของตัวละครเดียวกันนับเป็นรายการเดียว
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {groupAutoTerms(lexicon.auto)
                  .slice(0, 16)
                  .map((entry) => (
                    <li
                      key={entry}
                      title="นำเข้าอัตโนมัติ - เปลี่ยนตามต้นทาง จึงลบที่นี่ไม่ได้"
                      className="inline-flex min-h-7 items-center rounded-full bg-surface-secondary px-2.5 text-xs text-text-secondary"
                    >
                      {entry}
                    </li>
                  ))}
                {groupAutoTerms(lexicon.auto).length > 16 ? (
                  <li className="inline-flex min-h-7 items-center px-1 text-xs text-text-muted">
                    +อีก {groupAutoTerms(lexicon.auto).length - 16} รายการ
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
