"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { listMutes, removeMute } from "@/lib/ai-client";
import type { AiMute } from "@/types/ai";

/**
 * กฎที่ปิดไว้ (assistant-settings review §5).
 *
 * Every "ไม่เตือนแบบนี้อีก" pressed in an editor lands here. Until this list
 * existed, a silence taught with one click was permanent and invisible - the
 * writer who muted a rule about a word in March had no way to even remember
 * it in August, let alone turn it back on. Account data, so it lives on the
 * account page; each fiction-scoped row names its fiction.
 */

/** The same family vocabulary the editor's underlines use (13Y §3). */
const KIND_LABELS: Record<string, string> = {
  spelling: "คำผิด/ไวยากรณ์",
  punctuation: "วรรคตอน",
  repetition: "คำซ้ำ",
  polish: "เกลาภาษา",
};

export function MutedRules() {
  const [mutes, setMutes] = useState<AiMute[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMutes()
      .then((loaded) => {
        if (alive) setMutes(loaded);
      })
      .catch(() => {
        if (alive) setError("โหลดรายการไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function unmute(muteID: string) {
    setBusy(muteID);
    setError(null);
    try {
      await removeMute(muteID);
      setMutes((current) =>
        current ? current.filter((mute) => mute.id !== muteID) : current,
      );
    } catch {
      setError("เปิดการเตือนกลับไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="กฎที่ปิดไว้"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <p className="mono-label">กฎที่ปิดไว้</p>
      <p className="mt-1 text-xs text-text-secondary">
        ทุกครั้งที่กด “ไม่เตือนแบบนี้อีก” ในหน้าเขียน รายการจะมาอยู่ที่นี่ -
        เปิดกลับได้ทุกเมื่อ
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {error}
        </p>
      ) : null}

      {mutes === null ? (
        <p className="mt-2 text-xs text-text-muted">กำลังโหลด…</p>
      ) : mutes.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">
          ยังไม่ได้ปิดกฎอะไรไว้ - ผู้ช่วยเตือนครบทุกแบบ
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-2">
          {mutes.map((mute) => (
            <li
              key={mute.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="shrink-0 rounded bg-surface-secondary px-1.5 py-0.5 text-xs text-text-secondary">
                {KIND_LABELS[mute.kind] ?? mute.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="break-all">{mute.term}</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  {mute.novel_slug ? (
                    <>
                      เฉพาะเรื่อง{" "}
                      <Link
                        href={`/studio/novels/${encodeURIComponent(mute.novel_slug)}`}
                        className="text-primary hover:underline"
                      >
                        {mute.novel_title ?? mute.novel_slug}
                      </Link>
                    </>
                  ) : (
                    "ทุกเรื่อง"
                  )}
                </span>
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void unmute(mute.id)}
                className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
              >
                <Icon name="bell" size={12} />
                {busy === mute.id ? "กำลังเปิด…" : "เปิดเตือนอีกครั้ง"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
