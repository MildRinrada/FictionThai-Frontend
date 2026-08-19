"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import { updateNovel } from "@/lib/novels-client";
import {
  type NovelStatus,
  VISIBILITY_CHOICES,
  VISIBILITY_MENU,
  Visibility,
} from "@/types/novel";

/**
 * The visibility badge beside the title (§13T).
 *
 * The overview's badges all answered "what kind of story is this" and none
 * answered the question a writer actually opens the page with: ใครเห็นเรื่องนี้
 * ได้บ้างตอนนี้. This badge answers it in one word, and clicking it changes it
 * in place - the same rungs the settings page offers, because two vocabularies
 * for one fact is how the two screens end up disagreeing.
 *
 * Moving OFF private while the fiction's status is still ฉบับร่าง also sets the
 * status to กำลังเผยแพร่: the API (correctly) refuses a shared draft, and a
 * badge that answered that refusal with an error would be a control that only
 * works for people who already know the rule.
 *
 * The API stays the authority. A move to สาธารณะ that the pre-publish checklist
 * refuses comes back as a 422 and is shown under the badge; nothing here
 * re-implements the gate (docs/11 §43).
 *
 * The MENU offers three of the five rungs: ส่วนตัว, ลิงก์ลับ, สาธารณะ. Those are
 * the three anyone can explain in a sentence. เฉพาะสมาชิก contradicts the
 * platform's own promise that reading needs no account, and เฉพาะผู้ติดตาม is a
 * specialist choice - both stay on the fiction's settings page rather than in
 * the control everyone passes through. A fiction already sitting on one of them
 * still shows it here (see `menu`), because a control that cannot display the
 * current state is worse than one with an extra row.
 */

const RUNG_ICONS: Record<Visibility, IconName> = {
  [Visibility.Public]: "globe",
  [Visibility.Members]: "users",
  [Visibility.Followers]: "heart",
  [Visibility.Unlisted]: "link",
  [Visibility.Private]: "lock",
};

export function VisibilityBadge({
  novelRef,
  visibility,
  status,
}: {
  novelRef: string;
  visibility: Visibility;
  status: NovelStatus;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<Visibility>(visibility);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // Light dismissal: click anywhere else and the menu folds away.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choice =
    VISIBILITY_CHOICES.find((option) => option.value === current) ??
    VISIBILITY_CHOICES[VISIBILITY_CHOICES.length - 1];

  // The three plain rungs, plus whichever specialist rung this fiction is
  // actually on, so the menu can always show where it stands today.
  const menu = VISIBILITY_CHOICES.filter(
    (option) => VISIBILITY_MENU.includes(option.value) || option.value === current,
  );

  async function change(next: Visibility) {
    setOpen(false);
    if (next === current) return;

    setSaving(true);
    setError(null);
    const previous = current;
    setCurrent(next);
    try {
      await updateNovel(novelRef, {
        visibility: next,
        // A draft cannot be shared (checkPublishability). Publishing IS the
        // intent of the click, so the status moves with it.
        ...(next !== Visibility.Private && status === "draft"
          ? { status: "ongoing" as NovelStatus }
          : {}),
      });
      router.refresh();
    } catch (cause) {
      setCurrent(previous);
      setError(
        cause instanceof ApiError ? cause.message : "เปลี่ยนการมองเห็นไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={root} className="relative inline-block">
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="กดเพื่อเปลี่ยนว่าใครเห็นเรื่องนี้ได้"
        className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium disabled:opacity-60 ${
          current === Visibility.Public
            ? "border-success/40 bg-success/10 text-success"
            : "border-border bg-surface-secondary text-text-secondary hover:border-primary-200 hover:text-text"
        }`}
      >
        <Icon name={RUNG_ICONS[current]} size={13} />
        {choice.label}
        <Icon name="chevron-down" size={12} className="opacity-60" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="ใครเห็นเรื่องนี้ได้บ้าง"
          className="absolute start-0 top-full z-30 mt-1.5 w-72 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
        >
          {menu.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === current}
              onClick={() => void change(option.value)}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-start hover:bg-surface-secondary ${
                option.value === current ? "bg-primary-50" : ""
              }`}
            >
              <Icon
                name={RUNG_ICONS[option.value]}
                size={15}
                className={`mt-0.5 shrink-0 ${
                  option.value === current ? "text-primary" : "text-text-muted"
                }`}
              />
              <span className="min-w-0">
                <span
                  className={`block text-sm ${
                    option.value === current ? "font-medium text-primary" : ""
                  }`}
                >
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                  {option.hint}
                </span>
              </span>
              {option.value === current ? (
                <Icon name="check" size={15} className="ms-auto shrink-0 text-primary" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="absolute start-0 top-full z-20 mt-1.5 w-72 rounded-md border border-error/30 bg-surface px-3 py-2 text-xs text-error shadow-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
