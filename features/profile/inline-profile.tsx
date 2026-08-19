"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { saveProfile } from "@/lib/profile-client";
import { OPEN_FOR_LABEL, profileName, type PublicProfile } from "@/types/profile";

import { ProfileEditor } from "@/features/profile/profile-editor";

/**
 * Inline editing on the profile page itself (profile review 2026-08, section
 * A - the biggest ask): what visitors see is edited WHERE they see it.
 *
 * The rules:
 *   - Every inline-editable spot wears its affordance on hover - a soft
 *     background and a pencil - never leaving the owner to guess.
 *   - The name edits in place (Enter บันทึก, Esc ยกเลิก). The bio's empty
 *     card is a BUTTON that becomes the textarea, with a counter.
 *   - Links, availability, and boundaries live in rows under the bio, each
 *     with a "+ เพิ่ม" when empty.
 *   - แก้ไขโปรไฟล์ stays, but it opens the full form in a dialog right here -
 *     it never bounces the owner to the settings page. Account matters
 *     (email, password, privacy) stay in /settings; what OTHERS see is
 *     edited here.
 *
 * Saves PATCH /me/profile and then refresh the server-rendered page, so what
 * the owner reads next is exactly what the server now holds.
 */

const BIO_MAX = 2000;
const BOUNDARIES_MAX = 1000;

function useSaveField() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(edit: Parameters<typeof saveProfile>[0]): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await saveProfile(edit);
      router.refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "บันทึกไม่สำเร็จ ลองอีกครั้ง");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error };
}

/** The hover dress every inline spot wears (section A's affordance rule). */
const AFFORDANCE =
  "group/edit relative rounded-md text-start transition-colors hover:bg-surface-secondary/60";

function Pencil() {
  return (
    <span
      aria-hidden
      className="absolute -end-1 top-0 hidden rounded bg-surface p-1 text-text-muted shadow-sm group-hover/edit:block"
    >
      <Icon name="edit" size={13} />
    </span>
  );
}

/** The display name, edited exactly where it is read. */
export function EditableName({ profile }: { profile: PublicProfile }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.display_name ?? "");
  const { save, busy, error } = useSaveField();
  const name = profileName(profile);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="คลิกเพื่อแก้ชื่อที่แสดง"
        className={`${AFFORDANCE} -mx-1 px-1`}
      >
        <h1 className="font-serif text-2xl leading-tight font-semibold tracking-tight sm:text-[29px]">
          {name}
        </h1>
        <Pencil />
      </button>
    );
  }

  return (
    <div>
      <input
        autoFocus
        value={value}
        maxLength={64}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save({ display_name: value.trim() }).then((ok) => {
              if (ok) setEditing(false);
            });
          }
          if (event.key === "Escape") setEditing(false);
        }}
        aria-label="ชื่อที่แสดง"
        placeholder={profile.username}
        className="w-full max-w-md rounded-md border border-primary bg-surface px-2 py-1 font-serif text-2xl font-semibold tracking-tight outline-none sm:text-[29px]"
      />
      <p className="mt-1 text-xs text-text-muted">
        Enter บันทึก · Esc ยกเลิก {busy ? "· กำลังบันทึก…" : ""}
      </p>
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </div>
  );
}

/** The bio: the empty card IS the editor's door, never a dead end. */
export function EditableBio({ profile }: { profile: PublicProfile }) {
  const intro = profile.author_bio ?? profile.bio ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(intro);
  const { save, busy, error } = useSaveField();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(intro);
          setEditing(true);
        }}
        title="คลิกเพื่อแก้แนะนำตัว"
        className={`${AFFORDANCE} -mx-1 mt-3 w-full px-1 py-0.5`}
      >
        {intro ? (
          <p className="font-serif text-sm leading-loose whitespace-pre-wrap">{intro}</p>
        ) : (
          <p className="text-sm text-text-muted">
            ยังไม่ได้เขียนแนะนำตัว - คลิกตรงนี้เพื่อเขียน
          </p>
        )}
        <Pencil />
      </button>
    );
  }

  return (
    <div className="mt-3">
      <textarea
        autoFocus
        rows={4}
        value={value}
        maxLength={BIO_MAX}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
        }}
        aria-label="แนะนำตัว"
        placeholder="เล่าให้คนอ่านรู้จักคุณ - เขียนแนวไหน ชอบอะไร รับคุยเรื่องอะไร"
        className="w-full rounded-md border border-primary bg-background px-3 py-2 font-serif text-sm leading-loose field-sizing-content focus:outline-none"
      />
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void save({ bio: value.trim() }).then((ok) => {
              if (ok) setEditing(false);
            })
          }
          className="inline-flex min-h-8 items-center rounded-md bg-primary px-3 font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-text-secondary hover:text-text"
        >
          ยกเลิก
        </button>
        <span className="ms-auto text-text-muted tabular-nums">
          {value.length}/{BIO_MAX}
        </span>
      </div>
      {error ? <p className="mt-1 text-xs text-error">{error}</p> : null}
    </div>
  );
}

/**
 * The rows under the bio: links, availability, and boundaries - each offering
 * its "+ เพิ่ม" when empty (section A).
 */
export function EditableExtras({ profile }: { profile: PublicProfile }) {
  const { save, busy, error } = useSaveField();
  const [addingLink, setAddingLink] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [editingBoundaries, setEditingBoundaries] = useState(false);
  const [boundaries, setBoundaries] = useState(profile.boundaries ?? "");

  const links = profile.links ?? [];
  const openFor = profile.open_for ?? [];

  async function addLink() {
    const cleanLabel = label.trim();
    const cleanUrl = url.trim();
    if (cleanLabel === "" || cleanUrl === "") return;
    const ok = await save({ links: [...links, { label: cleanLabel, url: cleanUrl }] });
    if (ok) {
      setLabel("");
      setUrl("");
      setAddingLink(false);
    }
  }

  function toggleOpenFor(kind: string) {
    const next = openFor.includes(kind as (typeof openFor)[number])
      ? openFor.filter((existing) => existing !== kind)
      : [...openFor, kind as (typeof openFor)[number]];
    void save({ open_for: next });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-hairline pt-3 text-sm">
      {/* ลิงก์โซเชียล */}
      <div>
        {links.length === 0 && !addingLink ? (
          <button
            type="button"
            onClick={() => setAddingLink(true)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            <Icon name="link" size={12} />
            + เพิ่มลิงก์โซเชียล
          </button>
        ) : null}
        {addingLink ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="ชื่อลิงก์ เช่น X"
              aria-label="ชื่อลิงก์"
              maxLength={24}
              className="min-h-8 w-28 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addLink();
                if (event.key === "Escape") setAddingLink(false);
              }}
              placeholder="https://…"
              aria-label="ที่อยู่ลิงก์"
              className="min-h-8 w-44 rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void addLink()}
              className="inline-flex min-h-8 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              เพิ่ม
            </button>
            <button
              type="button"
              onClick={() => setAddingLink(false)}
              className="text-xs text-text-secondary hover:text-text"
            >
              ยกเลิก
            </button>
          </div>
        ) : null}
      </div>

      {/* รับงาน (สถานะ "รับคอมมิชชัน" ฯลฯ) - inline switches. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-text-muted">รับงาน:</span>
        {Object.entries(OPEN_FOR_LABEL).map(([kind, kindLabel]) => {
          const on = openFor.includes(kind as (typeof openFor)[number]);
          return (
            <button
              key={kind}
              type="button"
              role="switch"
              aria-checked={on}
              disabled={busy}
              onClick={() => toggleOpenFor(kind)}
              className={`inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs disabled:opacity-60 ${
                on
                  ? "border-secondary-300 bg-secondary-50 font-medium text-secondary-600"
                  : "border-border text-text-secondary hover:border-secondary-300"
              }`}
            >
              {kindLabel}
            </button>
          );
        })}
      </div>

      {/* คำเตือน/ขอบเขต - the field the backend always had and no UI wrote. */}
      <div>
        {editingBoundaries ? (
          <div>
            <textarea
              autoFocus
              rows={2}
              value={boundaries}
              maxLength={BOUNDARIES_MAX}
              onChange={(event) => setBoundaries(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEditingBoundaries(false);
              }}
              aria-label="คำเตือนและขอบเขตของนักเขียน"
              placeholder="เช่น งดรับคุยเรื่องสปอยล์ · ไม่รับรีเควสต์คู่ที่ไม่ได้เขียน"
              className="w-full rounded-md border border-primary bg-background px-3 py-2 text-xs leading-relaxed field-sizing-content focus:outline-none"
            />
            <div className="mt-1 flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save({ boundaries: boundaries.trim() }).then((ok) => {
                    if (ok) setEditingBoundaries(false);
                  })
                }
                className="inline-flex min-h-7 items-center rounded-md bg-primary px-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setEditingBoundaries(false)}
                className="text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : profile.boundaries ? (
          <button
            type="button"
            onClick={() => {
              setBoundaries(profile.boundaries ?? "");
              setEditingBoundaries(true);
            }}
            title="คลิกเพื่อแก้ขอบเขต"
            className={`${AFFORDANCE} -mx-1 w-full px-1 py-0.5`}
          >
            <p className="text-xs leading-relaxed text-text-secondary">
              <span className="font-medium text-text">ขอบเขต:</span> {profile.boundaries}
            </p>
            <Pencil />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingBoundaries(true)}
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-dashed border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
          >
            + คำเตือน/ขอบเขตของฉัน
          </button>
        )}
      </div>

      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
}

/**
 * แก้ไขโปรไฟล์, repurposed (section A): the SAME full form, in a dialog on
 * this page - for the owner who prefers one sitting - instead of a bounce to
 * the settings page.
 */
export function EditProfileDialog({ profile }: { profile: PublicProfile }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
      >
        <Icon name="edit" size={14} />
        แก้ไขโปรไฟล์
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-10">
          <div
            role="dialog"
            aria-label="แก้ไขโปรไฟล์"
            className="w-full max-w-2xl rounded-xl border border-border bg-background p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-medium">แก้ไขโปรไฟล์</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  ทุกอย่างในนี้คือสิ่งที่คนอื่นเห็น - เรื่องบัญชี (อีเมล รหัสผ่าน)
                  อยู่ที่หน้าตั้งค่า
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
                aria-label="ปิดหน้าต่างแก้ไขโปรไฟล์"
                className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary hover:text-text"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <ProfileEditor profile={profile} />
          </div>
        </div>
      ) : null}
    </>
  );
}
