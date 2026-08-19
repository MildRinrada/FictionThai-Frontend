"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { convertChat, type ChatConversion } from "@/lib/ai-client";
import { count } from "@/lib/format";

/**
 * แปลงเป็นแชทฟิก (docs/CHAT-CONVERSION.md).
 *
 * The deterministic conversion engine reads the prose and returns chat
 * blocks - speakers claimed only on evidence, everything uncertain flagged.
 * This surface is the AUTHOR'S review of that answer: every dialogue block's
 * speaker can be corrected before anything is imported, flagged blocks say
 * why they are flagged, and the import itself only fills the chat DRAFT -
 * the manuscript is untouched, and nothing reaches the system until the
 * author presses บันทึกแบบร่าง like any other edit (save-model 2026-08).
 */

/** What the import hands the editor - the chat composer's own row shape. */
export interface ImportedMessage {
  key: string;
  speaker_name: string;
  content: string;
  message_type: "message" | "system" | "separator";
  side: "left" | "right";
}

/**
 * The one mapping from conversion blocks to composer rows, shared by the
 * review card's import and the editor's one-press convert - so the two paths
 * cannot disagree. `overrides` carries the author's per-block speaker
 * corrections from the review UI; the one-press path has none.
 */
export function messagesFromConversion(
  result: ChatConversion,
  overrides: Record<string, string> = {},
): ImportedMessage[] {
  const nameOf = (speakerID: string): string => {
    if (speakerID === "reader") return "คุณ";
    return result.characters.find((c) => c.speaker_id === speakerID)?.name ?? "";
  };

  return result.blocks.map((block, at) => {
    const key = `converted-${at}-${block.id}`;
    if (block.type === "dialogue") {
      const speaker = overrides[block.id] ?? block.speaker_id ?? "";
      const name = nameOf(speaker);
      if (name !== "") {
        return {
          key,
          speaker_name: name,
          content: block.text,
          message_type: "message" as const,
          // The reader sits right, like their own chat apps; everyone else
          // left. A layout starting point - the composer's per-row switch
          // stays in charge.
          side: speaker === "reader" ? ("right" as const) : ("left" as const),
        };
      }
      // No speaker: a chat message MUST name one, and inventing a name is the
      // one thing this tool never does. The words wait in a system row.
    }
    // Narration and actions become system rows, verbatim - never a message
    // invented in a character's mouth (spec §4).
    return {
      key,
      speaker_name: "",
      content: block.text,
      message_type: "system" as const,
      side: "left" as const,
    };
  });
}

export function ChatConversionCard({
  novelRef,
  text,
  existingMessages,
  onImport,
}: {
  novelRef: string;
  /** The prose to convert - the live draft, not the saved copy. */
  text: string;
  /** How many chat rows the chapter already holds - the import replaces them. */
  existingMessages: number;
  onImport: (messages: ImportedMessage[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatConversion | null>(null);
  /** The author's speaker corrections, block id → speaker id ("" = none). */
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [imported, setImported] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setImported(false);
    try {
      setResult(await convertChat(novelRef, text));
      setOverrides({});
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "แปลงไม่สำเร็จ ลองอีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  function speakerOf(blockID: string, original: string | null): string {
    return overrides[blockID] ?? original ?? "";
  }

  /** The name a bubble carries. The reader's bubble says คุณ, plainly. */
  function importNameOf(speakerID: string): string {
    if (speakerID === "reader") return "คุณ";
    return result?.characters.find((c) => c.speaker_id === speakerID)?.name ?? "";
  }

  function doImport() {
    if (!result) return;
    onImport(messagesFromConversion(result, overrides));
    setImported(true);
  }

  const unassigned = result
    ? result.blocks.filter(
        (block) =>
          block.type === "dialogue" &&
          importNameOf(speakerOf(block.id, block.speaker_id)) === "",
      ).length
    : 0;

  const flagged = result?.blocks.filter((block) => block.needs_review) ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <p className="mono-label">แปลงเป็นแชทฟิก</p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
        ระบบแยกบทพูดและระบุผู้พูดจากหลักฐานในต้นฉบับ (กติกาเดียวกับตัวตรวจตัวละคร
        ทำงานในเครื่องนี้) - ต้นฉบับร้อยแก้วไม่ถูกแตะ
        และไม่มีอะไรถูกบันทึกจนกว่าคุณจะกดบันทึกเอง
      </p>

      {error ? (
        <p role="alert" className="mt-2 rounded-md bg-error/10 px-2.5 py-1.5 text-xs text-error">
          {error}
        </p>
      ) : null}

      {!result ? (
        <button
          type="button"
          disabled={busy || text.trim() === ""}
          onClick={() => void run()}
          className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-primary-200 bg-primary-50/60 px-3 text-sm font-medium text-primary hover:border-primary hover:bg-primary-50 disabled:opacity-50"
        >
          <Icon name="message" size={15} />
          {busy ? "กำลังแปลง…" : "แปลงตอนนี้เป็นแชท"}
        </button>
      ) : (
        <div className="mt-3">
          <p className="text-xs text-text-secondary">
            {count(result.blocks.length)} บล็อก ·{" "}
            {count(result.blocks.filter((b) => b.type === "dialogue").length)} บทพูด
            {flagged.length > 0 ? (
              <span className="text-warning">
                {" "}
                · ต้องตรวจ {count(flagged.length)} จุด
              </span>
            ) : (
              <span className="text-success"> · ระบุผู้พูดได้ครบ</span>
            )}
          </p>

          <ol className="mt-2 flex max-h-80 flex-col gap-1.5 overflow-y-auto pe-1">
            {result.blocks.map((block) => (
              <li
                key={block.id}
                className={`rounded-md border px-2.5 py-2 text-xs ${
                  block.needs_review
                    ? "border-warning/60 bg-warning/5"
                    : "border-hairline"
                }`}
              >
                {block.type === "dialogue" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`speaker-${block.id}`}>
                        ผู้พูดของบล็อกนี้
                      </label>
                      <select
                        id={`speaker-${block.id}`}
                        value={speakerOf(block.id, block.speaker_id)}
                        onChange={(event) =>
                          setOverrides((current) => ({
                            ...current,
                            [block.id]: event.target.value,
                          }))
                        }
                        className="min-h-7 max-w-40 rounded border border-border bg-surface px-1.5 text-[11px] text-text-secondary outline-none focus:border-primary"
                      >
                        <option value="">ไม่ระบุผู้พูด</option>
                        {result.characters.map((character) => (
                          <option key={character.speaker_id} value={character.speaker_id}>
                            {character.name}
                          </option>
                        ))}
                        {result.characters.every((c) => c.speaker_id !== "reader") ? (
                          <option value="reader">คุณ (ผู้อ่าน)</option>
                        ) : null}
                      </select>
                      {block.needs_review ? (
                        <span className="text-[10px] text-warning">ตรวจ</span>
                      ) : null}
                    </div>
                    <p className="mt-1 leading-relaxed">“{block.text}”</p>
                    {block.reason ? (
                      <p className="mt-0.5 text-[11px] text-text-muted">{block.reason}</p>
                    ) : null}
                  </>
                ) : (
                  <p className="leading-relaxed text-text-muted">
                    <span className="mono-label me-1.5 text-[9px]">
                      {block.type === "action" ? "การกระทำ" : "บรรยาย"}
                    </span>
                    {block.text}
                  </p>
                )}
              </li>
            ))}
          </ol>

          {unassigned > 0 ? (
            <p className="mt-2 text-[11px] text-warning">
              มีบทพูดที่ยังไม่ระบุผู้พูด {count(unassigned)} รายการ -
              จะนำเข้าเป็นข้อความระบบไว้ก่อน (เลือกผู้พูดในรายการด้านบนได้เลย)
            </p>
          ) : null}
          {existingMessages > 0 ? (
            <p className="mt-2 text-[11px] text-warning">
              ตอนนี้มีบทสนทนาอยู่แล้ว {count(existingMessages)} ข้อความ -
              การนำเข้าจะแทนที่ร่างนั้น (ยังไม่บันทึกจนกว่าคุณจะกด)
            </p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doImport}
              disabled={imported}
              className="inline-flex min-h-9 flex-1 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {imported ? "นำเข้าแล้ว - อย่าลืมกดบันทึกแบบร่าง" : "นำเข้าเป็นบทสนทนา"}
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setImported(false);
              }}
              className="min-h-9 rounded-md border border-border px-3 text-xs text-text-secondary hover:text-text"
            >
              ปิดผลลัพธ์
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            บทสนทนาเป็นอีกร่างของตอนเดียวกัน ผู้อ่านยังเห็นร้อยแก้วตามเดิม
            จนกว่าจะเปลี่ยนรูปแบบการแสดงผลของตอน
          </p>
        </div>
      )}
    </section>
  );
}
