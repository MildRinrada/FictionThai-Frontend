"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { analyzeText } from "@/lib/ai-client";
import type { AiInlineSuggestion } from "@/types/ai";

/**
 * ลองดูว่าผู้ช่วยทำงานยังไง (assistant-settings review §2).
 *
 * This began as "ตรวจข้อความอย่างรวดเร็ว" - a bare tool floating on a settings
 * page. Reframed as what it was actually good for: letting a writer SEE what
 * the assistant does before deciding the switches above, with a sample
 * paragraph pre-filled so the first press costs nothing to compose. The real
 * checking lives in the editor, where the text is.
 *
 * Everything renders in Thai, including the finding chips - an English
 * "spelling · high" on a Thai writer's settings page reads as debug output.
 */

/** The same family vocabulary the editor's underlines use (13Y §3). */
const TYPE_LABELS: Record<string, string> = {
  spelling: "คำผิด",
  punctuation: "วรรคตอน",
  repetition: "คำซ้ำ",
  polish: "เกลาภาษา",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "ควรแก้",
  medium: "น่าดู",
  low: "เสนอแนะ",
};

/**
 * A short paragraph seeded with the mistakes the rules actually catch - a
 * doubled เ, repeated words, stacked punctuation - so pressing the button
 * demonstrates something rather than answering "ไม่พบข้อเสนอแนะ".
 */
const SAMPLE_TEXT =
  "เเมวสีดำตัวหนึ่งเดินมามองมองมองอยู่หน้าประตูบ้าน!!! " +
  "มันร้องเรียกเจ้าของบ้านอยู่นานนาน ก่อนจะเดินจากไปอย่างเงียบเงียบ";

export function AssistantDemo() {
  const router = useRouter();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiInlineSuggestion[] | null>(null);

  const toMessage = useCallback(
    (cause: unknown): string => {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return "กรุณาเข้าสู่ระบบ";
      }
      if (cause instanceof ApiError) {
        if (cause.status === 503) return "ผู้ช่วยเขียนไม่พร้อมใช้งานขณะนี้";
        if (cause.code === "AI_QUOTA_EXCEEDED") return "ใช้งานครบโควตาของวันนี้แล้ว";
        if (cause.isRateLimited) return "ใช้งานถี่เกินไป กรุณารอสักครู่";
      }
      // Whatever the API said, the writer gets Thai - a raw English message
      // on this page is the bug the review named.
      return "เกิดข้อผิดพลาด กรุณาลองใหม่";
    },
    [router],
  );

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setSuggestions(await analyzeText(text));
    } catch (cause) {
      setError(toMessage(cause));
      setSuggestions(null);
    } finally {
      setBusy(false);
    }
  };

  const ignore = (index: number) =>
    setSuggestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));

  return (
    <section
      aria-labelledby="ai-demo"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <p id="ai-demo" className="mono-label">
        ลองดูว่าผู้ช่วยทำงานยังไง
      </p>
      <p className="mt-1 text-xs text-text-secondary">
        กดตรวจข้อความตัวอย่างด้านล่างได้เลย หรือวางข้อความของคุณเองแทน -
        ในหน้าเขียนจริง การตรวจแบบเดียวกันนี้ทำงานเองระหว่างพิมพ์
      </p>

      <textarea
        aria-label="ข้อความสำหรับตรวจ"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="mt-2.5 w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || text.trim() === ""}
          onClick={() => void check()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="sparkle" size={14} />
          {busy ? "กำลังตรวจ…" : "ตรวจข้อความ"}
        </button>
        {text !== SAMPLE_TEXT ? (
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE_TEXT);
              setSuggestions(null);
            }}
            className="text-xs text-text-secondary hover:text-primary"
          >
            กลับไปใช้ข้อความตัวอย่าง
          </button>
        ) : null}
        {error ? (
          <span role="alert" className="text-xs text-error">
            {error}
          </span>
        ) : null}
      </div>

      {suggestions ? (
        suggestions.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">ไม่พบข้อเสนอแนะ</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2" data-testid="ai-inline-list">
            {suggestions.map((s, i) => (
              <li
                key={`${s.start}-${s.end}-${i}`}
                className="rounded-md border border-border p-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs text-text-secondary">
                    {TYPE_LABELS[s.type] ?? s.type}
                    {SEVERITY_LABELS[s.severity]
                      ? ` · ${SEVERITY_LABELS[s.severity]}`
                      : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => ignore(i)}
                    className="ml-auto text-xs text-text-secondary hover:text-primary"
                  >
                    ละเว้น
                  </button>
                </div>
                <p className="mt-1">{s.explanation}</p>
                {s.suggestions.length > 0 ? (
                  <p className="mt-1 text-text-secondary">
                    แนะนำ: <span className="font-medium">{s.suggestions.join(", ")}</span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
