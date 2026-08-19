"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { refreshProfileCache } from "@/app/settings/profile/actions";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import {
  createPenName,
  deletePenName,
  updatePenName,
} from "@/lib/pen-names-client";
import type { PenNameView } from "@/types/profile";

/**
 * นามปากกา - the owner's editor
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2).
 *
 * A client island because everything on it is a write. Each action is its own
 * request against the caller's own rows, and what the API returns replaces the
 * list entry - the server owns normalisation and the default, never this
 * component.
 *
 * The delete confirmation says, in words, that no work is deleted. That is not
 * politeness: a writer being asked to remove one of their identities has every
 * reason to fear it takes the stories with it, and the API's answer (the
 * fiction keeps every word and falls back to the default name) is worth stating
 * before the button, not after.
 */

const LIMIT = { name: 64, note: 40 } as const;

/**
 * "Validation failed." tells a writer nothing. The API answers in English
 * field errors; this turns the ones typing can actually cause into a Thai
 * sentence that names the rule.
 */
function thaiError(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback;
  const fields = cause.fields;
  const says = (key: string, part: string) =>
    fields?.[key]?.some((message) => message.includes(part)) ?? false;

  if (says("name", "already use")) {
    return "คุณมีนามปากกาชื่อนี้อยู่แล้ว - ใช้ชื่ออื่น หรือแก้ไขชื่อเดิมด้านล่าง";
  }
  if (says("name", "maximum")) {
    return `ตั้งนามปากกาได้สูงสุด 20 ชื่อ - ลบชื่อที่ไม่ใช้แล้วก่อน`;
  }
  if (says("name", "needs a name")) return "ใส่ชื่อนามปากกาก่อน";
  if (says("name", "too long")) return `ชื่อนามปากกายาวเกิน ${LIMIT.name} ตัวอักษร`;
  if (says("note", "too long")) return `โน้ตยาวเกิน ${LIMIT.note} ตัวอักษร`;
  return cause.message || fallback;
}

export function PenNamesPanel({
  username,
  initialPenNames,
}: {
  /** The caller's own handle, used to expire their cached public profile. */
  username: string;
  initialPenNames: PenNameView[];
}) {
  const router = useRouter();

  const [penNames, setPenNames] = useState<PenNameView[]>(initialPenNames ?? []);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  // One row edits at a time, and one row confirms a delete at a time: two open
  // destructive confirmations on one screen is how the wrong one gets pressed.
  const [editingID, setEditingID] = useState<string | null>(null);
  const [confirmingID, setConfirmingID] = useState<string | null>(null);

  /** Expire the shared public profile so the change is visible immediately. */
  async function published() {
    await refreshProfileCache(username);
    router.refresh();
  }

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;

    // The API refuses a duplicate too; answering here says it in Thai without
    // a round trip.
    if (penNames.some((pen) => pen.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(`คุณมีนามปากกาชื่อ «${trimmed}» อยู่แล้ว`);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const created = await createPenName({
        name: trimmed,
        note: note.trim() || null,
      });
      setPenNames((current) => [...current, created]);
      setName("");
      setNote("");
      setStatus(`เพิ่มนามปากกา «${created.name}» แล้ว`);
      await published();
    } catch (cause) {
      setError(thaiError(cause, "เพิ่มนามปากกาไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  /** Returns true when the save went through. */
  async function onSave(id: string, edit: { name?: string; note?: string | null }) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await updatePenName(id, edit);
      setPenNames((current) => current.map((pen) => (pen.id === id ? saved : pen)));
      setStatus(`บันทึก «${saved.name}» แล้ว`);
      await published();
      return true;
    } catch (cause) {
      setError(thaiError(cause, "บันทึกนามปากกาไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSetDefault(id: string) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await updatePenName(id, { is_default: true });
      // The default is exclusive, so the whole list moves with it rather than
      // the one row the API answered about.
      setPenNames((current) =>
        current.map((pen) =>
          pen.id === id ? saved : { ...pen, is_default: false },
        ),
      );
      setStatus(`ใช้ «${saved.name}» เป็นนามปากกาเริ่มต้นแล้ว`);
      await published();
    } catch (cause) {
      setError(thaiError(cause, "ตั้งค่าเริ่มต้นไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(penName: PenNameView) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await deletePenName(penName.id);
      setPenNames((current) => current.filter((pen) => pen.id !== penName.id));
      setConfirmingID(null);
      setStatus(`ลบนามปากกา «${penName.name}» แล้ว ผลงานทั้งหมดยังอยู่ครบ`);
      await published();
    } catch (cause) {
      setError(thaiError(cause, "ลบนามปากกาไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-secondary">
        นามปากกาคือชื่อที่ผู้อ่านเห็นบนผลงาน เปลี่ยนได้ตลอด และเลือกได้ว่าจะเผยแพร่เรื่องไหนในชื่อไหน
        ส่วน @{username} เป็นชื่อผู้ใช้ถาวรที่เปลี่ยนไม่ได้
      </p>

      <form
        onSubmit={onAdd}
        className="mb-6 rounded-lg border border-primary-200 bg-primary-50 p-4"
      >
        <div className="flex flex-wrap gap-2.5">
          <div className="min-w-40 flex-1">
            <label htmlFor="new-pen-name" className="mono-label block">
              นามปากกา
            </label>
            <input
              id="new-pen-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={LIMIT.name}
              placeholder="ชื่อที่ผู้อ่านจะเห็น"
              className="mt-1.5 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label htmlFor="new-pen-note" className="mono-label block">
              โน้ต
            </label>
            <input
              id="new-pen-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={LIMIT.note}
              placeholder="เช่น แยกแนว · ร่วมเขียน"
              className="mt-1.5 min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || name.trim() === ""}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="plus" size={16} />
          เพิ่มนามปากกา
        </button>
        <p className="mt-2 text-xs text-text-secondary">
          ชื่อแรกที่เพิ่มจะกลายเป็นค่าเริ่มต้นให้อัตโนมัติ
        </p>
      </form>

      {error ? (
        <p role="alert" className="mb-4 rounded-md bg-error/10 px-3 py-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="mb-4 min-h-4 text-sm text-text-muted">
        {status}
      </p>

      {penNames.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-text-secondary">
          ยังไม่มีนามปากกา - ตอนนี้ผลงานของคุณจะแสดงด้วยชื่อที่แสดงบนโปรไฟล์
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {penNames.map((penName) => (
            <li key={penName.id}>
              <PenNameRow
                penName={penName}
                busy={busy}
                editing={editingID === penName.id}
                confirming={confirmingID === penName.id}
                onEdit={() => {
                  setConfirmingID(null);
                  setEditingID(penName.id);
                }}
                onCancelEdit={() => setEditingID(null)}
                onSave={async (edit) => {
                  if (await onSave(penName.id, edit)) setEditingID(null);
                }}
                onSetDefault={() => void onSetDefault(penName.id)}
                onAskDelete={() => {
                  setEditingID(null);
                  setConfirmingID(penName.id);
                }}
                onCancelDelete={() => setConfirmingID(null)}
                onDelete={() => void onDelete(penName)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PenNameRow({
  penName,
  busy,
  editing,
  confirming,
  onEdit,
  onCancelEdit,
  onSave,
  onSetDefault,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  penName: PenNameView;
  busy: boolean;
  editing: boolean;
  confirming: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (edit: { name: string; note: string | null }) => void;
  onSetDefault: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(penName.name);
  const [draftNote, setDraftNote] = useState(penName.note ?? "");

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      {editing ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="min-w-40 flex-1">
            <label htmlFor={`pen-name-${penName.id}`} className="mono-label block">
              ชื่อนามปากกา
            </label>
            <input
              id={`pen-name-${penName.id}`}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              maxLength={LIMIT.name}
              className="mt-1.5 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="min-w-40 flex-1">
            <label htmlFor={`pen-note-${penName.id}`} className="mono-label block">
              โน้ตของชื่อนี้
            </label>
            <input
              id={`pen-note-${penName.id}`}
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              maxLength={LIMIT.note}
              className="mt-1.5 min-h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || draftName.trim() === ""}
              onClick={() =>
                onSave({ name: draftName.trim(), note: draftNote.trim() || null })
              }
              className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              บันทึกชื่อ
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftName(penName.name);
                setDraftNote(penName.note ?? "");
                onCancelEdit();
              }}
              className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-serif text-base font-semibold">
              {penName.name}
            </span>
            {penName.note ? (
              <span className="mt-0.5 block truncate text-xs text-text-muted">
                {penName.note}
              </span>
            ) : null}
          </span>

          {penName.is_default ? (
            <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs text-primary">
              ค่าเริ่มต้น
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSetDefault}
              className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
            >
              ตั้งเป็นค่าเริ่มต้น
            </button>
          )}

          <button
            type="button"
            onClick={onEdit}
            aria-label={`แก้ไข ${penName.name}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
          >
            <Icon name="edit" size={13} />
            แก้ไข
          </button>
          <button
            type="button"
            onClick={onAskDelete}
            aria-label={`ลบ ${penName.name}`}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-text-muted hover:text-error"
          >
            <Icon name="trash" size={13} />
            ลบ
          </button>
        </div>
      )}

      {confirming ? (
        <div className="mt-3 rounded-md border border-error/40 bg-error/5 p-3">
          <p className="text-sm text-error">
            ลบนามปากกา «{penName.name}» ถาวร?
            การลบนี้ไม่ลบผลงานของคุณแม้แต่เรื่องเดียว
            เรื่องที่เคยเผยแพร่ในชื่อนี้จะยังอยู่ครบทุกตอนทุกตัวอักษร
            และจะกลับไปแสดงด้วยนามปากกาเริ่มต้นแทน
          </p>
          <div className="mt-2.5 flex gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onDelete}
              className="inline-flex min-h-9 items-center rounded-md bg-error px-3.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              ยืนยันลบนามปากกา
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className="inline-flex min-h-9 items-center rounded-md border border-border px-3.5 text-sm text-text-secondary"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
