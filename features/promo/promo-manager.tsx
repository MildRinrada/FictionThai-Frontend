"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { uploadMedia } from "@/lib/media-client";
import {
  createPromoSlide,
  deletePromoSlide,
  listPromoSlides,
  reorderPromoSlides,
  updatePromoSlide,
} from "@/lib/promo-client";
import { count } from "@/lib/format";
import { MEDIA_ACCEPT } from "@/types/media";
import {
  PROMO_SOURCE_LABELS,
  type AdminPromoSlide,
  type PromoSlideInput,
  type PromoSource,
  type PromoTextSide,
} from "@/types/promo";

/**
 * คิวสไลด์หน้าแรก - the staff console (docs/HOME-PROMO.md).
 *
 * One page owns the whole queue: order (up/down - deliberate, keyboard-usable
 * moves rather than drag), schedule, enable, source, the live preview, and
 * the counters a paid slot's buyer is shown. The deck rules are enforced by
 * the API at read time; this page's job is to make the queue's state legible
 * enough that the rules never surprise anyone.
 */

const EMPTY_FORM: PromoSlideInput = {
  kicker: "",
  headline: "",
  tagline: "",
  cta_label: "",
  link_url: "",
  image_url: null,
  bg_color: null,
  text_side: "start",
  source: "editorial",
  enabled: false,
  starts_at: null,
  ends_at: null,
};

/**
 * The link field accepts what an admin actually pastes - the full URL out of
 * the browser bar - and reduces it to the internal path the API demands.
 * A foreign origin is returned untouched so the Thai error can name the rule
 * rather than silently mangling the value. Exported for tests.
 */
export function normalizeLink(raw: string): string {
  let value = raw.trim();
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return url.origin === window.location.origin
        ? url.pathname + url.search + url.hash
        : value;
    } catch {
      return value;
    }
  }
  // "localhost:3000/novel/x" pasted without a scheme.
  if (value.startsWith(window.location.host + "/")) {
    value = value.slice(window.location.host.length);
  }
  if (!value.startsWith("/")) value = "/" + value;
  return value;
}

/**
 * The API's field errors, said in Thai. The server speaks English by
 * convention (its message is a contract detail, not UI copy); surfacing that
 * verbatim was the review's "error ภาษาอังกฤษ" bug wearing a new form.
 */
const FIELD_ERRORS_TH: Record<string, string> = {
  headline: "ต้องมีพาดหัว ยาวได้ไม่เกิน 120 ตัวอักษร",
  kicker: "ป้ายบรรทัดบนยาวได้ไม่เกิน 40 ตัวอักษร",
  tagline: "คำโปรยยาวได้ไม่เกิน 160 ตัวอักษร",
  cta_label: "ข้อความปุ่มยาวได้ไม่เกิน 40 ตัวอักษร",
  link_url: "ลิงก์ต้องเป็น path ภายในเว็บ ขึ้นต้นด้วย / เช่น /novel/ชื่อเรื่อง",
  image_url: "ลิงก์ภาพยาวเกินไป",
  bg_color: "สีพื้นต้องอยู่ในรูป #rrggbb เช่น #292731",
  text_side: "ฝั่งข้อความต้องเป็นซ้ายหรือขวา",
  source: "ที่มาไม่ถูกต้อง",
  ends_at: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม",
};

function thaiError(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError && cause.fields) {
    const key = Object.keys(cause.fields)[0];
    if (key && FIELD_ERRORS_TH[key]) return FIELD_ERRORS_TH[key];
  }
  return fallback;
}

/** ISO ↔ datetime-local, in the browser's zone. */
function toLocal(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toForm(slide: AdminPromoSlide): PromoSlideInput {
  return {
    kicker: slide.kicker,
    headline: slide.headline,
    tagline: slide.tagline,
    cta_label: slide.cta_label,
    link_url: slide.link_url,
    image_url: slide.image_url ?? null,
    bg_color: slide.bg_color ?? null,
    text_side: slide.text_side,
    source: slide.source,
    enabled: slide.enabled,
    starts_at: slide.starts_at ?? null,
    ends_at: slide.ends_at ?? null,
  };
}

export function PromoManager() {
  const [slides, setSlides] = useState<AdminPromoSlide[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<PromoSlideInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    listPromoSlides()
      .then((loaded) => {
        if (alive) setSlides(loaded);
      })
      .catch((cause) => {
        if (alive) {
          setError(
            cause instanceof ApiError && cause.status === 403
              ? "หน้านี้สำหรับทีมงานเท่านั้น"
              : "โหลดคิวไม่สำเร็จ",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  function openEditor(target: AdminPromoSlide | "new") {
    setError(null);
    if (target === "new") {
      setForm(EMPTY_FORM);
      setEditing("new");
    } else {
      setForm(toForm(target));
      setEditing(target.id);
    }
  }

  async function save() {
    // Normalise the link the way the blur handler does, so a paste-then-save
    // without ever leaving the field still submits the internal path.
    const linkURL = normalizeLink(form.link_url);
    const body = { ...form, link_url: linkURL };
    setForm(body);
    if (!linkURL.startsWith("/") || linkURL.startsWith("//")) {
      setError(FIELD_ERRORS_TH.link_url);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (editing === "new") {
        const created = await createPromoSlide(body);
        setSlides((current) => (current ? [...current, created] : [created]));
      } else if (editing) {
        const updated = await updatePromoSlide(editing, body);
        setSlides((current) =>
          current
            ? current.map((slide) => (slide.id === editing ? updated : slide))
            : current,
        );
      }
      setEditing(null);
    } catch (cause) {
      setError(thaiError(cause, "บันทึกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(slide: AdminPromoSlide, enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updatePromoSlide(slide.id, { ...toForm(slide), enabled });
      setSlides((current) =>
        current
          ? current.map((entry) => (entry.id === slide.id ? updated : entry))
          : current,
      );
    } catch (cause) {
      setError(thaiError(cause, "สลับเปิดปิดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, step: -1 | 1) {
    if (!slides) return;
    const index = slides.findIndex((slide) => slide.id === id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next);
    setBusy(true);
    try {
      setSlides(await reorderPromoSlides(next.map((slide) => slide.id)));
    } catch {
      setError("จัดลำดับไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await deletePromoSlide(id);
      setSlides((current) =>
        current ? current.filter((slide) => slide.id !== id) : current,
      );
      if (editing === id) setEditing(null);
    } catch {
      setError("ลบสไลด์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function uploadBanner(file: File) {
    setBusy(true);
    setError(null);
    try {
      const media = await uploadMedia({ file, purpose: "promo_banner" });
      setForm((current) => ({ ...current, image_url: media.url }));
    } catch {
      setError("อัปโหลดแบนเนอร์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (slides === null) {
    return (
      <p className="rounded-lg border border-border p-4 text-sm text-text-secondary">
        {error ?? "กำลังโหลดคิว…"}
      </p>
    );
  }

  const paidCount = slides.filter(
    (slide) => slide.enabled && slide.source === "paid",
  ).length;

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-error">
          {error}
        </p>
      ) : null}

      {/* The ratio, stated where the queue is edited: the API will drop a
          second paid slide silently at serve time, and silence here would
          read as a bug there. */}
      {paidCount > 1 ? (
        <p className="mb-3 rounded-md border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-text-secondary">
          มีสไลด์ซื้อพื้นที่เปิดอยู่ {paidCount} ใบ -
          ระบบเสิร์ฟให้ผู้อ่านสูงสุด 1 ใบต่อชุด (กติกา 1 ใน 4)
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {slides.map((slide, index) => (
          <li
            key={slide.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3.5 py-2.5"
          >
            <span className="flex shrink-0 flex-col">
              <button
                type="button"
                aria-label="เลื่อนขึ้น"
                disabled={busy || index === 0}
                onClick={() => void move(slide.id, -1)}
                className="text-text-muted hover:text-text disabled:opacity-30"
              >
                <Icon name="chevron-up" size={14} />
              </button>
              <button
                type="button"
                aria-label="เลื่อนลง"
                disabled={busy || index === slides.length - 1}
                onClick={() => void move(slide.id, 1)}
                className="text-text-muted hover:text-text disabled:opacity-30"
              >
                <Icon name="chevron-down" size={14} />
              </button>
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{slide.headline}</span>
                <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary">
                  {PROMO_SOURCE_LABELS[slide.source]}
                </span>
                {slide.source === "paid" ? (
                  <span className="shrink-0 rounded-sm border border-border px-1.5 font-mono text-[10px] text-text-muted">
                    โปรโมท
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">
                {slide.starts_at || slide.ends_at
                  ? `${toLocal(slide.starts_at) || "ทันที"} → ${toLocal(slide.ends_at) || "ไม่กำหนดจบ"}`
                  : "ไม่ตั้งเวลา - ขึ้นตามสวิตช์"}
                {" · แสดง "}
                {count(slide.impressions)}
                {" ครั้ง · คลิก "}
                {count(slide.clicks)}
                {" ครั้ง"}
              </span>
            </span>

            <Switch
              checked={slide.enabled}
              disabled={busy}
              onChange={(next) => void toggle(slide, next)}
              aria-label={`เปิดสไลด์ ${slide.headline}`}
            />
            <button
              type="button"
              onClick={() => openEditor(slide)}
              className="inline-flex min-h-8 items-center rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
            >
              แก้ไข
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(slide.id)}
              className="inline-flex min-h-8 items-center rounded-md border border-error/40 px-2.5 text-xs text-error hover:bg-error/10 disabled:opacity-50"
            >
              ลบ
            </button>
          </li>
        ))}
      </ul>

      {slides.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          ยังไม่มีสไลด์ในคิว - หน้าแรกจะแสดงแบนเนอร์อัตโนมัติ (อันดับ 1 ยอดนิยม) แทน
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => openEditor("new")}
        className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
      >
        <Icon name="plus" size={15} />
        เพิ่มสไลด์
      </button>

      {editing !== null ? (
        <div className="mt-5 rounded-lg border border-border bg-surface p-4">
          <p className="mono-label">{editing === "new" ? "สไลด์ใหม่" : "แก้ไขสไลด์"}</p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              ป้ายบรรทัดบน
              <input
                value={form.kicker}
                onChange={(e) => setForm({ ...form, kicker: e.target.value })}
                placeholder="เรื่องเด่น / อีเวนต์เดือนนี้"
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm">
              พาดหัว (1 บรรทัด)
              <input
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              คำโปรย (1 บรรทัด)
              <input
                value={form.tagline}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="text-sm">
              ลิงก์ปลายทาง
              <input
                value={form.link_url}
                onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                onBlur={(e) =>
                  setForm((current) => ({
                    ...current,
                    link_url: normalizeLink(e.target.value),
                  }))
                }
                placeholder="/novel/…"
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2.5 font-mono text-sm outline-none focus:border-primary"
              />
              <span className="mt-1 block text-xs font-normal text-text-muted">
                วางลิงก์เต็มจากเว็บนี้ได้เลย ระบบตัดให้เหลือ path อัตโนมัติ -
                ลิงก์ออกนอกเว็บใช้ไม่ได้
              </span>
            </label>
            <label className="text-sm">
              ข้อความปุ่ม
              <input
                value={form.cta_label}
                onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
                placeholder="อ่านเลย"
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
            </label>

            <label className="text-sm">
              ที่มา
              <select
                value={form.source}
                onChange={(e) =>
                  setForm({ ...form, source: e.target.value as PromoSource })
                }
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                {(Object.keys(PROMO_SOURCE_LABELS) as PromoSource[]).map((source) => (
                  <option key={source} value={source}>
                    {PROMO_SOURCE_LABELS[source]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              ข้อความอยู่ฝั่ง
              <select
                value={form.text_side}
                onChange={(e) =>
                  setForm({ ...form, text_side: e.target.value as PromoTextSide })
                }
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="start">ซ้าย</option>
                <option value="end">ขวา</option>
              </select>
            </label>

            <label className="text-sm">
              เริ่มแสดง
              <input
                type="datetime-local"
                value={toLocal(form.starts_at)}
                onChange={(e) => setForm({ ...form, starts_at: fromLocal(e.target.value) })}
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              />
            </label>
            <label className="text-sm">
              สิ้นสุด
              <input
                type="datetime-local"
                value={toLocal(form.ends_at)}
                onChange={(e) => setForm({ ...form, ends_at: fromLocal(e.target.value) })}
                className="mt-1 min-h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              />
            </label>

            <div className="text-sm sm:col-span-2">
              <span className="block">ภาพแบนเนอร์ (แนวนอน) + สีพื้นสำรอง</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept={MEDIA_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadBanner(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 disabled:opacity-50"
                >
                  <Icon name="image" size={14} />
                  {form.image_url ? "เปลี่ยนภาพ" : "อัปโหลดภาพ"}
                </button>
                {form.image_url ? (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, image_url: null })}
                    className="text-xs text-text-secondary hover:text-error"
                  >
                    เอาภาพออก
                  </button>
                ) : null}
                <input
                  value={form.bg_color ?? ""}
                  onChange={(e) => setForm({ ...form, bg_color: e.target.value || null })}
                  placeholder="#292731"
                  aria-label="สีพื้นสำรอง"
                  className="min-h-9 w-28 rounded-md border border-border bg-background px-2.5 font-mono text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          {/* พรีวิว - the same shape the visitor meets, no separate preview
              route to drift from the real thing. */}
          <div className="mt-4">
            <p className="mono-label">พรีวิว</p>
            <div
              className={`relative mt-2 flex min-h-44 flex-col justify-end overflow-hidden rounded-xl border border-border p-5 ${
                form.text_side === "end" ? "items-end text-end" : "items-start"
              }`}
              style={{ backgroundColor: form.bg_color || "#292731" }}
            >
              {form.image_url ? (
                <span
                  aria-hidden
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${form.image_url})` }}
                />
              ) : null}
              <span
                aria-hidden
                className="absolute inset-0 bg-linear-to-t from-[#292731]/75 via-[#292731]/25 to-transparent"
              />
              <span className="relative max-w-lg">
                <span className="flex items-center gap-2">
                  {form.kicker ? (
                    <span className="mono-label text-white/75">{form.kicker}</span>
                  ) : null}
                  {form.source === "paid" ? (
                    <span className="inline-flex min-h-5 items-center rounded-sm border border-white/40 px-1.5 font-mono text-[10px] text-white/85">
                      โปรโมท
                    </span>
                  ) : null}
                </span>
                <span className="mt-1.5 block font-serif text-xl font-semibold text-white">
                  {form.headline || "พาดหัวสไลด์"}
                </span>
                {form.tagline ? (
                  <span className="mt-1 block text-sm text-white/80">{form.tagline}</span>
                ) : null}
                <span className="mt-3 inline-flex min-h-8 items-center rounded-md bg-white px-3.5 text-sm font-medium text-[#292731]">
                  {form.cta_label || "อ่านเลย"}
                </span>
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.enabled}
                onChange={(next) => setForm({ ...form, enabled: next })}
              />
              เปิดใช้งาน
            </label>
            <span className="flex-1" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "กำลังบันทึก…" : "บันทึกสไลด์"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
              className="inline-flex min-h-10 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:text-text disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
