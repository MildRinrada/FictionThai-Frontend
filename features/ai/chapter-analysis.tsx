"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { createAiRequest, decideSuggestion, getAiRequest } from "@/lib/ai-client";
import {
  AI_FEATURE_LABELS,
  AI_FEATURES,
  isTerminal,
  type AiDecision,
  type AiFeature,
  type AiRequest,
  type AiRequestStatus,
  type AiSuggestionStatus,
} from "@/types/ai";

/**
 * วิเคราะห์ตอนนี้ - the persisted request → accept/reject workflow
 * (docs/12 §14, docs/08 §26), moved into the chapter editor's side panel.
 *
 * It used to live on the account settings page behind a "chapter id" text
 * field - a tool aimed at one chapter, on a page that knows no chapter,
 * asking the writer to paste a UUID (assistant-settings review §1). The
 * editor knows which chapter is open, so here the id field does not exist.
 *
 * Folded closed by default: the live tools above it are the everyday surface;
 * this is the deliberate round - batch analysis and the async summary - whose
 * every decision is recorded. Nothing here edits the manuscript.
 */

const REQUEST_STATUS_LABELS: Record<AiRequestStatus, string> = {
  queued: "รอคิว",
  processing: "กำลังประมวลผล",
  completed: "เสร็จแล้ว",
  failed: "ไม่สำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

const SUGGESTION_STATUS_LABELS: Record<AiSuggestionStatus, string> = {
  pending: "รอตัดสิน",
  accepted: "ยอมรับแล้ว",
  rejected: "ปฏิเสธแล้ว",
  dismissed: "ละเว้นแล้ว",
};

const TYPE_LABELS: Record<string, string> = {
  spelling: "คำผิด",
  punctuation: "วรรคตอน",
  repetition: "คำซ้ำ",
  polish: "เกลาภาษา",
  summary: "สรุปเนื้อหา",
};

export function ChapterAnalysis({ chapterId }: { chapterId: string }) {
  const router = useRouter();
  const [feature, setFeature] = useState<AiFeature>("spell_check");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<AiRequest | null>(null);
  const pollGuard = useRef(0);

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
        if (cause.isNotFound) return "ไม่พบตอนนี้ หรือคุณไม่มีสิทธิ์เข้าถึง";
      }
      return "เกิดข้อผิดพลาด กรุณาลองใหม่";
    },
    [router],
  );

  const poll = useCallback(async (id: string) => {
    const token = ++pollGuard.current;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (pollGuard.current !== token) return; // superseded by a newer request
      try {
        const next = await getAiRequest(id);
        setRequest(next);
        if (isTerminal(next.status)) return;
      } catch {
        return;
      }
    }
  }, []);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setRequest(null);
    try {
      const created = await createAiRequest(feature, chapterId);
      setRequest(created);
      if (!isTerminal(created.status)) void poll(created.id);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (suggestionId: string, decision: AiDecision) => {
    try {
      const updated = await decideSuggestion(suggestionId, decision);
      setRequest((prev) =>
        prev
          ? {
              ...prev,
              suggestions: prev.suggestions.map((s) =>
                s.id === suggestionId ? { ...s, status: updated.status } : s,
              ),
            }
          : prev,
      );
    } catch (cause) {
      setError(toMessage(cause));
    }
  };

  return (
    <details className="group rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3.5 py-2.5 text-sm text-text-secondary hover:text-text [&::-webkit-details-marker]:hidden">
        <Icon
          name="chevron-right"
          size={14}
          className="transition-transform group-open:rotate-90"
        />
        วิเคราะห์ตอนนี้ (AI)
      </summary>

      <div className="border-t border-hairline px-3.5 py-3">
        <p className="text-xs text-text-secondary">
          ตรวจทั้งตอนเป็นรอบใหญ่ หรือให้สรุปเนื้อหา - ทุกข้อเสนอรอให้คุณตัดสิน
          ไม่มีอะไรแก้ต้นฉบับเอง
        </p>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <select
            aria-label="ฟีเจอร์"
            value={feature}
            onChange={(e) => setFeature(e.target.value as AiFeature)}
            className="min-h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-sm"
          >
            {AI_FEATURES.map((f) => (
              <option key={f} value={f}>
                {AI_FEATURE_LABELS[f]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <Icon name="sparkle" size={13} />
            {busy ? "กำลังส่ง…" : "วิเคราะห์"}
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-2 text-xs text-error">
            {error}
          </p>
        ) : null}

        {request ? <RequestResult request={request} onDecide={decide} /> : null}
      </div>
    </details>
  );
}

function RequestResult({
  request,
  onDecide,
}: {
  request: AiRequest;
  onDecide: (suggestionId: string, decision: AiDecision) => void;
}) {
  return (
    <div className="mt-3" data-testid="ai-request-result">
      <p className="text-sm">
        สถานะ:{" "}
        <span data-testid="ai-request-status" className="font-medium">
          {REQUEST_STATUS_LABELS[request.status] ?? request.status}
        </span>
        {request.status === "failed" ? (
          <span className="text-error"> - ลองใหม่อีกครั้งได้</span>
        ) : null}
      </p>

      {!isTerminal(request.status) ? (
        <p className="mt-1 text-sm text-text-secondary">กำลังประมวลผล…</p>
      ) : null}

      {request.suggestions.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-2" data-testid="ai-suggestion-list">
          {request.suggestions.map((s) => (
            <li key={s.id} className="rounded-md border border-border p-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-xs text-text-secondary">
                  AI · {TYPE_LABELS[s.type] ?? s.type}
                </span>
                <span
                  data-testid="ai-suggestion-status"
                  className="ml-auto text-xs text-text-secondary"
                >
                  {SUGGESTION_STATUS_LABELS[s.status] ?? s.status}
                </span>
              </div>
              {s.original_text ? (
                <p className="mt-1 text-text-secondary">เดิม: {s.original_text}</p>
              ) : null}
              {s.suggested_text ? <p className="mt-1">เสนอ: {s.suggested_text}</p> : null}
              {s.explanation ? (
                <p className="mt-1 text-xs text-text-secondary">{s.explanation}</p>
              ) : null}

              {s.status === "pending" ? (
                <div className="mt-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onDecide(s.id, "accepted")}
                    className="text-primary hover:underline"
                  >
                    ยอมรับ
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(s.id, "rejected")}
                    className="text-text-secondary hover:underline"
                  >
                    ปฏิเสธ
                  </button>
                  <button
                    type="button"
                    onClick={() => onDecide(s.id, "dismissed")}
                    className="text-text-secondary hover:underline"
                  >
                    ละเว้น
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : isTerminal(request.status) && request.status === "completed" ? (
        <p className="mt-2.5 text-sm text-text-secondary">ไม่พบข้อเสนอแนะ</p>
      ) : null}
    </div>
  );
}
