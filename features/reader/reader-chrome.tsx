"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Icon } from "@/components/ui/icon";
import {
  LINE_HEIGHTS,
  MAX_FONT_SIZE,
  MEASURES,
  MIN_FONT_SIZE,
  READER_THEMES,
  READER_THEME_LABELS,
  getReaderPrefs,
  getReaderPrefsServerSnapshot,
  readerStyle,
  subscribeReaderPrefs,
  updateReaderPrefs,
  type ReaderPrefs,
} from "@/lib/reader-prefs";
import type { ChapterSummary } from "@/types/novel";

/**
 * The reader's chrome: the control bar, the reading-settings popover, and the
 * table-of-contents drawer.
 *
 * Both controls are transient surfaces - a popover and a drawer - rather than a
 * permanent toolbar, so that once a reader has set their preferences the page
 * is text and nothing else. That is the whole reading position: the competitors
 * keep a persistent control strip on screen; here the content is allowed to be
 * the only thing on it.
 *
 * The chapter itself is rendered on the SERVER and passed in as `children`, so
 * putting the controls in a client island costs no JavaScript for the prose.
 * Preferences are applied as CSS custom properties on the wrapper, which means
 * the prose and chat renderers inherit them without knowing they exist.
 */

export interface ReaderChromeProps {
  novelSlug: string;
  novelTitle: string;
  chapterLabel: string;
  currentChapterId: string;
  chapters: ChapterSummary[];
  showChapterNav: boolean;
  /**
   * อ่านแบบแชท, when this chapter can offer it (§13O): prose with dialogue in
   * it. Lives in the floating toolbar (reader toolbar review 2026-08), so the
   * switch travels with the reader instead of scrolling away with the header.
   */
  chatToggle?: { href: string; active: boolean } | null;
  /** The heart - the fiction's like control, composed by the page. */
  likeSlot?: ReactNode;
  children: ReactNode;
}

export function ReaderChrome({
  novelSlug,
  novelTitle,
  chapterLabel,
  currentChapterId,
  chapters,
  showChapterNav,
  chatToggle = null,
  likeSlot = null,
  children,
}: ReaderChromeProps) {
  // Read through the external store rather than copied into state: the server
  // renders the documented defaults, and React swaps in the reader's saved
  // preferences once hydration is done. The first paint is therefore the
  // default - a deliberate trade against putting blocking JavaScript on the
  // site's hottest path.
  const prefs = useSyncExternalStore(
    subscribeReaderPrefs,
    getReaderPrefs,
    getReaderPrefsServerSnapshot,
  );

  const [panel, setPanel] = useState<"none" | "settings" | "toc">("none");
  const [percent, setPercent] = useState(0);
  const settingsRef = useRef<HTMLDivElement>(null);

  // The rail is a display value only - the saved reading position is the
  // ProgressTracker's job, and the two must not both write.
  useEffect(() => {
    let frame = 0;
    const sample = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        setPercent(
          scrollable <= 0
            ? 100
            : Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)),
        );
      });
    };

    sample();
    window.addEventListener("scroll", sample, { passive: true });
    window.addEventListener("resize", sample);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", sample);
      window.removeEventListener("resize", sample);
    };
  }, []);

  useEffect(() => {
    if (panel === "none") return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanel("none");
    }
    function onPointerDown(event: MouseEvent) {
      // The drawer covers the page and closes on its own scrim; only the
      // popover needs outside-click dismissal.
      if (panel !== "settings") return;
      if (!settingsRef.current?.contains(event.target as Node)) setPanel("none");
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [panel]);

  return (
    <div
      data-reader-theme={prefs.theme}
      style={readerStyle(prefs)}
      className="min-h-screen bg-reader-background text-reader-text transition-colors duration-200"
    >
      <div className="sticky top-15 z-30 border-b border-reader-rule bg-reader-background/95 backdrop-blur-sm">
        <div className="mx-auto flex min-h-12 max-w-[var(--page-width)] items-center gap-3 px-5 sm:px-8">
          <Link
            href={`/novel/${encodeURIComponent(novelSlug)}`}
            className="flex shrink-0 items-center gap-1 text-sm text-reader-muted hover:text-reader-text"
          >
            <Icon name="chevron-left" size={16} />
            <span className="hidden sm:inline">หน้าเรื่อง</span>
          </Link>

          <p className="min-w-0 flex-1 truncate text-sm text-reader-muted">
            <span className="text-reader-text">{novelTitle}</span>
            <span aria-hidden="true"> · </span>
            {chapterLabel}
          </p>

          <div ref={settingsRef} className="relative flex shrink-0 items-center gap-1">
            {showChapterNav ? (
              <button
                type="button"
                onClick={() => setPanel(panel === "toc" ? "none" : "toc")}
                aria-expanded={panel === "toc"}
                className="flex size-9 items-center justify-center rounded-md text-reader-muted hover:text-reader-text"
                title="สารบัญ"
                aria-label="สารบัญ"
              >
                <Icon name="list" size={18} />
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
              aria-expanded={panel === "settings"}
              className="flex size-9 items-center justify-center rounded-md text-reader-muted hover:text-reader-text"
              title="ตั้งค่าการอ่าน"
              aria-label="ตั้งค่าการอ่าน"
            >
              <Icon name="type" size={18} />
            </button>

            {panel === "settings" ? (
              <ReadingSettings prefs={prefs} onChange={updateReaderPrefs} />
            ) : null}
          </div>
        </div>

        {/* The rail is decorative; the percentage is announced in the settings
            popover's heading instead of being locked inside a graphic. */}
        <div aria-hidden="true" className="h-0.5 bg-reader-rule">
          <div
            className="h-full bg-primary transition-[width] duration-150"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {children}

      {/*
        The floating toolbar (reader toolbar review 2026-08): the handful of
        controls a reader reaches for WHILE reading, in one pill that never
        scrolls away - how far along, the type size, the face, the paper, the
        chat layout, and the heart. The header popover keeps the full settings
        (line height, measure); this is the shortlist. md+ only: on a phone
        the pill would sit on the text it serves.
      */}
      <div className="fixed bottom-5 inset-s-5 z-40 hidden items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-text shadow-popover md:flex">
        <span
          className="min-w-11 text-center font-mono text-xs text-text-secondary tabular-nums"
          title="อ่านถึง"
        >
          {Math.round(percent)}%
        </span>

        <PillDivider />

        <PillButton
          label="ลดขนาดตัวอักษร"
          disabled={prefs.fontSize <= MIN_FONT_SIZE}
          onClick={() => updateReaderPrefs({ fontSize: prefs.fontSize - 1 })}
        >
          A−
        </PillButton>
        <PillButton
          label="เพิ่มขนาดตัวอักษร"
          disabled={prefs.fontSize >= MAX_FONT_SIZE}
          onClick={() => updateReaderPrefs({ fontSize: prefs.fontSize + 1 })}
        >
          A+
        </PillButton>

        <PillDivider />

        {/* The face, said by its current name; pressing flips to the other. */}
        <button
          type="button"
          onClick={() => updateReaderPrefs({ face: prefs.face === "serif" ? "sans" : "serif" })}
          title="สลับแบบอักษร"
          className="min-h-8 rounded-full px-2.5 text-xs text-text-secondary hover:bg-surface-secondary hover:text-text"
        >
          {prefs.face === "serif" ? "เซริฟ" : "ซานส์"}
        </button>

        <PillDivider />

        <span className="flex items-center gap-1.5 px-1">
          {READER_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => updateReaderPrefs({ theme })}
              aria-pressed={prefs.theme === theme}
              aria-label={`พื้นหลัง${READER_THEME_LABELS[theme]}`}
              title={READER_THEME_LABELS[theme]}
              data-reader-theme={theme}
              className={`size-5 rounded-full border bg-reader-background ${
                prefs.theme === theme
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary-200"
              }`}
            />
          ))}
        </span>

        {chatToggle ? (
          <>
            <PillDivider />
            <Link
              href={chatToggle.href}
              replace
              scroll={false}
              aria-pressed={chatToggle.active}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs ${
                chatToggle.active
                  ? "bg-primary font-medium text-white"
                  : "border border-border text-text-secondary hover:text-text"
              }`}
            >
              <Icon name="message" size={13} />
              ดูแบบแชท
            </Link>
          </>
        ) : null}

        {likeSlot ? (
          <>
            <PillDivider />
            {likeSlot}
          </>
        ) : null}
      </div>

      {panel === "toc" ? (
        <TableOfContents
          novelSlug={novelSlug}
          chapters={chapters}
          currentChapterId={currentChapterId}
          onClose={() => setPanel("none")}
        />
      ) : null}
    </div>
  );
}

function ReadingSettings({
  prefs,
  onChange,
}: {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="ตั้งค่าการอ่าน"
      className="absolute inset-e-0 top-[calc(100%+10px)] z-50 w-75 rounded-xl border border-border bg-surface p-4 text-text shadow-popover"
    >
      <Field label="ขนาดตัวอักษร">
        <div className="flex items-center gap-2">
          <StepButton
            label="ลดขนาดตัวอักษร"
            disabled={prefs.fontSize <= MIN_FONT_SIZE}
            onClick={() => onChange({ fontSize: prefs.fontSize - 1 })}
          >
            A−
          </StepButton>
          <span className="min-w-12 text-center font-mono text-sm tabular-nums">
            {prefs.fontSize}px
          </span>
          <StepButton
            label="เพิ่มขนาดตัวอักษร"
            disabled={prefs.fontSize >= MAX_FONT_SIZE}
            onClick={() => onChange({ fontSize: prefs.fontSize + 1 })}
          >
            A+
          </StepButton>
        </div>
      </Field>

      <Field label="แบบอักษร">
        <Segmented
          options={[
            { key: "serif", label: "เซริฟ" },
            { key: "sans", label: "ซานส์" },
          ]}
          value={prefs.face}
          onSelect={(key) => onChange({ face: key as ReaderPrefs["face"] })}
        />
      </Field>

      <Field label="ระยะบรรทัด">
        <Segmented
          options={LINE_HEIGHTS.map((item) => ({ key: item.key, label: item.label }))}
          value={prefs.lineHeight}
          onSelect={(key) => onChange({ lineHeight: key as ReaderPrefs["lineHeight"] })}
        />
      </Field>

      <Field label="ความกว้างคอลัมน์">
        <Segmented
          options={MEASURES.map((item) => ({ key: item.key, label: item.label }))}
          value={prefs.measure}
          onSelect={(key) => onChange({ measure: key as ReaderPrefs["measure"] })}
        />
      </Field>

      <Field label="พื้นหลัง">
        <div className="grid grid-cols-4 gap-2">
          {READER_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => onChange({ theme })}
              aria-pressed={prefs.theme === theme}
              data-reader-theme={theme}
              className={`flex min-h-13 flex-col items-center justify-center gap-1 rounded-md border-2 bg-reader-background text-[10px] text-reader-text ${
                prefs.theme === theme ? "border-primary" : "border-border"
              }`}
            >
              <span aria-hidden="true" className="font-serif text-sm">
                ก
              </span>
              {READER_THEME_LABELS[theme]}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function PillDivider() {
  return <span aria-hidden className="mx-1 h-4 w-px bg-hairline" />;
}

function PillButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-full text-xs text-text-secondary hover:bg-surface-secondary hover:text-text disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="mono-label mb-2">{label}</p>
      {children}
    </div>
  );
}

function StepButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-md border border-border text-sm hover:bg-surface-secondary disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Segmented({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onSelect(option.key)}
          aria-pressed={value === option.key}
          className={`min-h-9 flex-1 rounded-md border px-2 text-[13px] ${
            value === option.key
              ? "border-primary bg-primary-50 text-primary"
              : "border-border text-text-secondary hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TableOfContents({
  novelSlug,
  chapters,
  currentChapterId,
  onClose,
}: {
  novelSlug: string;
  chapters: ChapterSummary[];
  currentChapterId: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="ปิดสารบัญ"
        onClick={onClose}
        className="flex-1 bg-[#292731]/35"
      />
      <div
        role="dialog"
        aria-label="สารบัญ"
        className="flex w-80 max-w-[85vw] flex-col border-s border-border bg-surface text-text"
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <p className="font-serif text-base font-semibold">สารบัญ</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <ol className="flex-1 overflow-y-auto">
          {chapters.map((chapter) => {
            const current = chapter.id === currentChapterId;
            return (
              <li key={chapter.id}>
                <Link
                  href={`/read/${encodeURIComponent(novelSlug)}/${encodeURIComponent(chapter.slug)}`}
                  onClick={onClose}
                  aria-current={current ? "page" : undefined}
                  className={`flex gap-3 border-b border-hairline px-4 py-3 text-sm hover:bg-surface-secondary ${
                    current ? "bg-primary-50" : ""
                  }`}
                >
                  <span className="w-6 shrink-0 font-mono text-xs text-text-muted tabular-nums">
                    {chapter.chapter_number}
                  </span>
                  <span className={`min-w-0 flex-1 ${current ? "text-primary" : ""}`}>
                    {chapter.title ?? `ตอนที่ ${chapter.chapter_number}`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
