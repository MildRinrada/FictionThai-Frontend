"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { refreshProfileCache } from "@/app/settings/profile/actions";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { saveProfile } from "@/lib/profile-client";
import {
  OPEN_FOR_LABEL,
  type OpenFor,
  type ProfileLink,
  type PublicProfile,
} from "@/types/profile";

/**
 * The profile editor - the write path that did not exist
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
 *
 * Until now a person could not change their own display name, introduction, or
 * links from anywhere in the product: `user_profiles` was readable everywhere
 * and writable only by an avatar upload.
 *
 * Everything here is one form with one save. Pictures are the exception: an
 * upload attaches server-side the moment it succeeds, because a half-finished
 * form should not be able to lose a file the writer already chose.
 */

const LINK_SLOTS = 4;
const BIO_MAX = 2000;
const NAME_MAX = 64;

export function ProfileEditor({ profile }: { profile: PublicProfile }) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [website, setWebsite] = useState(profile.website_url ?? "");
  const [links, setLinks] = useState<ProfileLink[]>(() =>
    padLinks(profile.links ?? []),
  );
  const [openFor, setOpenFor] = useState<OpenFor[]>(profile.open_for ?? []);
  const [inRankings, setInRankings] = useState(!profile.hide_from_rankings);
  // The wall switch (profile review 2026-08 section G): the backend always
  // supported it; this is its first UI.
  const [wallOpen, setWallOpen] = useState(profile.wall_enabled);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    setSaved(false);
    try {
      await saveProfile({
        display_name: displayName,
        bio,
        website_url: website,
        // Blank rows are the writer leaving a slot empty, not an edit.
        links: links.filter((link) => link.url.trim() !== ""),
        open_for: openFor,
        hide_from_rankings: !inRankings,
        wall_enabled: wallOpen,
      });
      setSaved(true);
      // The public profile is a shared, cached response. Expire it so the
      // writer - and everyone else - sees the change now rather than when the
      // revalidation window happens to end.
      await refreshProfileCache(profile.username);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.fields) {
        setFields(cause.fields);
      }
      setError(
        cause instanceof ApiError ? cause.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {/* NEITHER picture is here (owner's standing rule, restated 2026-08:
          no dialog, no settings page for pictures - point at the picture and
          press the camera). The cover is changed on the profile band itself;
          the avatar is changed on the avatar itself, camera on hover. This
          form edits words and switches only. */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">ชื่อและแนะนำตัว</h2>

        <Field
          label="ชื่อที่แสดง"
          hint={`@${profile.username} เป็นชื่อผู้ใช้ถาวร เปลี่ยนไม่ได้ ส่วนชื่อที่แสดงเปลี่ยนได้ตลอด`}
          error={fields.display_name?.[0]}
        >
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={NAME_MAX}
            placeholder={profile.username}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field label="แนะนำตัว" error={fields.bio?.[0]}>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={BIO_MAX}
            rows={5}
            className="w-full rounded-md border border-border bg-background px-3 py-2 font-serif text-sm leading-relaxed"
          />
          <p className="mt-1 text-end font-mono text-[11px] text-text-muted tabular-nums">
            {bio.length}/{BIO_MAX}
          </p>
        </Field>

        <Field label="เว็บไซต์" error={fields.website_url?.[0]}>
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            inputMode="url"
            placeholder="https://"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">ติดต่อและโซเชียล</h2>
        <p className="mt-1 text-sm text-text-secondary">
          ใส่เท่าที่อยากให้คนอื่นเห็น เว้นว่างไว้ก็ได้
        </p>
        {fields.links?.[0] ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {fields.links[0]}
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3">
          {links.map((link, index) => (
            <div key={index} className="flex flex-wrap gap-2">
              <input
                value={link.label}
                onChange={(event) => setLinks(editLink(links, index, { label: event.target.value }))}
                placeholder="ชื่อลิงก์"
                aria-label={`ชื่อลิงก์ที่ ${index + 1}`}
                maxLength={24}
                className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                value={link.url}
                onChange={(event) => setLinks(editLink(links, index, { url: event.target.value }))}
                placeholder="https://"
                aria-label={`ที่อยู่ลิงก์ที่ ${index + 1}`}
                inputMode="url"
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">ตอนนี้รับงานอะไรอยู่</h2>
        <p className="mt-1 text-sm text-text-secondary">
          บอกล่วงหน้าว่ารับอะไรอยู่ ช่วยลดคำขอที่ไม่ตรงกัน - เปลี่ยนหรือปิดได้ทุกเมื่อ
          FictionThai ไม่เกี่ยวข้องกับการตกลงหรือการจ่ายเงินใด ๆ
        </p>
        {fields.open_for?.[0] ? (
          <p role="alert" className="mt-2 text-sm text-error">
            {fields.open_for[0]}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(OPEN_FOR_LABEL) as OpenFor[]).map((kind) => {
            const on = openFor.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() =>
                  setOpenFor(on ? openFor.filter((k) => k !== kind) : [...openFor, kind])
                }
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                  on
                    ? "border-secondary-300 bg-secondary-50 text-secondary-600"
                    : "border-border text-text-secondary hover:border-primary-200"
                }`}
              >
                {OPEN_FOR_LABEL[kind]}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">อันดับนักเขียน</h2>
        <p className="mt-1 text-sm text-text-secondary">
          หน้าแรกมีอันดับนักเขียนที่สลับเกณฑ์ทุกสัปดาห์ (มาแรง · หน้าใหม่ ·
          ลงตอนสม่ำเสมอ) ตัวเลขแสดงเป็นช่วงเสมอ ไม่มีตัวเลขเป๊ะ ๆ -
          ถ้าไม่อยากให้ชื่อคุณปรากฏ ปิดได้ที่นี่ มีผลกับทุกอันดับ
        </p>
        <label className="mt-4 flex items-center justify-between gap-4">
          <span className="text-sm">แสดงชื่อฉันในอันดับนักเขียน</span>
          <Switch
            checked={inRankings}
            onChange={setInRankings}
            aria-label="แสดงชื่อฉันในอันดับนักเขียน"
          />
        </label>
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-lg font-semibold">กำแพงโปรไฟล์</h2>
        <p className="mt-1 text-sm text-text-secondary">
          พื้นที่ให้ผู้อ่านฝากข้อความถึงคุณบนหน้าโปรไฟล์ -
          ปิดเมื่อไหร่ กำแพงทั้งแผงจะหายไปจากหน้า และเปิดกลับได้เสมอ
        </p>
        <label className="mt-4 flex items-center justify-between gap-4">
          <span className="text-sm">เปิดกำแพงให้คนฝากข้อความ</span>
          <Switch
            checked={wallOpen}
            onChange={setWallOpen}
            aria-label="เปิดกำแพงให้คนฝากข้อความ"
          />
        </label>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
        </button>
        <Link
          href="/profile"
          className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
        >
          ดูโปรไฟล์
        </Link>
        {saved ? (
          <span role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Icon name="check" size={15} />
            บันทึกแล้ว
          </span>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="mono-label">{label}</span>
      {hint ? <span className="mt-1 block text-xs text-text-muted">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span role="alert" className="mt-1 block text-sm text-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}

/** Always render a few empty rows so adding a link needs no extra button. */
function padLinks(links: ProfileLink[]): ProfileLink[] {
  const rows = links.slice(0, LINK_SLOTS);
  while (rows.length < LINK_SLOTS) rows.push({ label: "", url: "" });
  return rows;
}

function editLink(
  links: ProfileLink[],
  index: number,
  change: Partial<ProfileLink>,
): ProfileLink[] {
  return links.map((link, i) => (i === index ? { ...link, ...change } : link));
}
