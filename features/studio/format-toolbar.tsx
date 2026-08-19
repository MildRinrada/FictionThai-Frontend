"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { ApiError } from "@/lib/api";
import {
  IMAGE_WIDTHS,
  MAX_IMAGE_WIDTH,
  MIN_IMAGE_WIDTH,
  MARK_COLOURS,
  TEXT_COLOURS,
  safeHref,
  safeImageSrc,
  type MarkColour,
  type TextColour,
} from "@/lib/markup";
import { uploadMedia } from "@/lib/media-client";
import type { RichEditorHandle } from "@/features/studio/rich-editor";
import { MEDIA_ACCEPT } from "@/types/media";

/**
 * แถบจัดรูปแบบ - the writer editor's formatting toolbar
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13N, docs/04 §8, docs/01 §18).
 *
 * Every button drives `execCommand` against the live editing surface, so the
 * result is visible the instant it is pressed and the browser's own undo
 * history records it. The toolbar holds no formatting state of its own - there
 * is nothing here that can disagree with what the writer is looking at.
 *
 * Colour and highlight come from a CLOSED palette rather than a colour picker.
 * docs/05 §6 makes dark mode a designed theme rather than an inversion, so a
 * raw hex in a manuscript would be unreadable in one of the two themes and its
 * author would never see it happen. Each name is defined for both, so a writer
 * picks a meaning and the platform keeps it legible.
 */

/** A full picker is a product of its own; this is the fiction shortlist. */
const EMOJI = [
  "❤️", "💔", "✨", "🌙", "☀️", "🌧️", "🌸", "🍂",
  "😊", "😢", "😳", "😠", "😱", "🥺", "😴", "🙄",
  "☕", "🍜", "🎧", "📖", "✉️", "🔥", "❄️", "⭐",
];

const TEXT_COLOUR_LABELS: Record<TextColour, string> = {
  red: "แดง",
  orange: "ส้ม",
  green: "เขียว",
  blue: "น้ำเงิน",
  purple: "ม่วง",
  grey: "เทา",
};

const MARK_COLOUR_LABELS: Record<MarkColour, string> = {
  yellow: "เหลือง",
  green: "เขียว",
  blue: "ฟ้า",
  pink: "ชมพู",
};

interface Tool {
  key: string;
  icon?: IconName;
  glyph?: ReactNode;
  label: string;
  className?: string;
  command: string;
  value?: string;
}

const INLINE_TOOLS: Tool[] = [
  { key: "bold", glyph: "B", label: "ตัวหนา", className: "font-bold", command: "bold" },
  {
    key: "italic",
    glyph: "I",
    label: "ตัวเอียง",
    className: "font-serif italic",
    command: "italic",
  },
  {
    key: "underline",
    glyph: "U",
    label: "ขีดเส้นใต้",
    className: "underline underline-offset-2",
    command: "underline",
  },
  {
    key: "strike",
    glyph: "S",
    label: "ขีดฆ่า",
    className: "line-through",
    command: "strikeThrough",
  },
  {
    key: "sub",
    glyph: (
      <span>
        X<sub className="text-[9px]">2</sub>
      </span>
    ),
    label: "ตัวห้อย",
    command: "subscript",
  },
  {
    key: "sup",
    glyph: (
      <span>
        X<sup className="text-[9px]">2</sup>
      </span>
    ),
    label: "ตัวยก",
    command: "superscript",
  },
];

const BLOCK_TOOLS: Tool[] = [
  { key: "bullet", icon: "list", label: "รายการ", command: "insertUnorderedList" },
  {
    key: "ordered",
    icon: "list-ordered",
    label: "รายการมีลำดับ",
    command: "insertOrderedList",
  },
  // คั่นฉาก moved out of this row: it is one of the platform's own moves and
  // now sits in the featured group at the end (editor review 2026-08 C).
  {
    key: "quote",
    glyph: <span className="font-serif text-[13px] font-semibold">99</span>,
    label: "ยกคำพูด",
    command: "formatBlock",
    value: "blockquote",
  },
  {
    key: "heading",
    icon: "type",
    label: "หัวข้อ",
    command: "formatBlock",
    value: "h2",
  },
];

/**
 * Reads which commands are already on at the caret.
 *
 * Without this, ตัวยก and ตัวห้อย read as "add another one": press twice and a
 * writer expects to be back where they started, sees nothing change, and
 * presses again. `execCommand` has always toggled; what was missing was the
 * button admitting which state it is in. The BROWSER is asked rather than a
 * copy being kept in the toolbar, so the two cannot disagree.
 *
 * Null means the caret is not in this editor, and the caller leaves the buttons
 * where they were - a selection in a completely different field must not
 * silently un-light the formatting of the text the writer just left.
 */
function activeStates(
  editor: RefObject<RichEditorHandle | null>,
): Record<string, boolean> | null {
  const node = editor.current?.element();
  if (!node) return null;
  const anchor = window.getSelection?.()?.anchorNode;
  if (!anchor || !node.contains(anchor)) return null;

  const next: Record<string, boolean> = {};
  for (const name of TRACKED) {
    try {
      next[name] = document.queryCommandState(name);
    } catch {
      // Not every environment implements every command; an unknown one is
      // simply never lit.
      next[name] = false;
    }
  }
  return next;
}

/** The commands whose on/off state a button reflects. */
const TRACKED = [
  "bold",
  "italic",
  "underline",
  "strikeThrough",
  "subscript",
  "superscript",
  "insertUnorderedList",
  "insertOrderedList",
  "justifyLeft",
  "justifyCenter",
  "justifyRight",
] as const;

const ALIGN_TOOLS: Tool[] = [
  { key: "left", icon: "align-left", label: "ชิดซ้าย", command: "justifyLeft" },
  { key: "center", icon: "align-center", label: "จัดกึ่งกลาง", command: "justifyCenter" },
  { key: "right", icon: "align-right", label: "ชิดขวา", command: "justifyRight" },
];

export function FormatToolbar({
  editor,
  novelRef,
  children,
}: {
  editor: RefObject<RichEditorHandle | null>;
  /** The fiction an inserted image is authorized and uploaded against. */
  novelRef: string;
  /**
   * The platform-specific inserts - แทรกตัวแปร and friends - rendered inline
   * in the featured group at the row's end, never folded behind a ⊕.
   */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [href, setHref] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});
  // Whether a picture is selected (§13S). The image row only appears when
  // there is an image to act on - a row of size buttons that do nothing is
  // worse than no row.
  const [imagePicked, setImagePicked] = useState(false);
  // The picked image's current width, driving the free-size slider (editor
  // review 2026-08 item 1). Null width = natural size, shown as 100.
  const [imageWidth, setImageWidth] = useState(100);
  const picker = useRef<HTMLInputElement>(null);

  // The caret moved, so what is switched on may have changed - and so may
  // whether a picture is selected.
  useEffect(() => {
    function onSelectionChange() {
      const next = activeStates(editor);
      if (next) setActive(next);
      const picked = editor.current?.pickedImage() ?? null;
      setImagePicked(picked != null);
      if (picked) {
        const raw = Number.parseFloat(picked.style.width);
        setImageWidth(Number.isFinite(raw) ? Math.round(raw) : 100);
      }
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [editor]);

  /** One place applies a width, so the slider and the presets cannot drift. */
  function applyImageWidth(width: number) {
    setImageWidth(width);
    // 100% is the natural size, and the manuscript records no width for it -
    // so it is stored as "no size chosen".
    editor.current?.resizeImage(width >= MAX_IMAGE_WIDTH ? null : width);
  }

  function run(tool: Tool) {
    editor.current?.command(tool.command, tool.value);
    // A command that toggled something off has to un-light its own button, and
    // `selectionchange` does not always fire for an edit in place.
    const next = activeStates(editor);
    if (next) setActive(next);
  }

  /**
   * Wraps the selection in one of the palette's classes.
   *
   * `insertHTML` rather than `foreColor`: the browser's colour commands emit a
   * raw value - a `<font color>` or an inline style - and a manuscript that
   * carries a hex is a manuscript that is unreadable in the other theme. The
   * class name is the author's CHOICE; the two hexes behind it belong to the
   * design system (docs/05 §6).
   */
  function paint(className: string | null) {
    const handle = editor.current;
    if (!handle) return;

    const selection = window.getSelection?.();
    const text = selection?.toString() ?? "";
    if (text === "") {
      setOpen(null);
      return;
    }

    if (className === null) {
      // Re-inserting the words as plain text is what drops whatever wrapped
      // them, and it keeps the words themselves untouched.
      handle.insertText(text);
    } else {
      const tag = className.startsWith("ft-mark-") ? "mark" : "span";
      handle.insertHTML(`<${tag} class="${className}">${escapeHTML(text)}</${tag}>`);
    }
    setOpen(null);
  }

  function toggle(panel: string) {
    setOpen((current) => (current === panel ? null : panel));
    setLinkError(null);
    setUploadError(null);
  }

  function addLink(event: React.FormEvent) {
    event.preventDefault();
    // The same allowlist the renderer applies, checked here so a writer is told
    // now rather than finding an inert link in their published chapter.
    const checked = safeHref(href);
    if (!checked) {
      setLinkError("ใส่ได้เฉพาะลิงก์ http:// https:// หรือลิงก์ในเว็บนี้");
      return;
    }

    const selection = window.getSelection?.();
    const text = selection?.toString() ?? "";
    if (text === "") {
      editor.current?.insertHTML(
        `<a href="${escapeHTML(checked)}">${escapeHTML(checked)}</a>`,
      );
    } else {
      editor.current?.command("createLink", checked);
    }
    setHref("");
    setOpen(null);
  }

  function addImageURL(event: React.FormEvent) {
    event.preventDefault();
    // The same allowlist the renderer applies, so a writer is told now rather
    // than finding their alt text where a picture should be.
    const checked = safeImageSrc(imageURL);
    if (!checked) {
      setUploadError("ใส่ได้เฉพาะลิงก์รูป http:// หรือ https://");
      return;
    }
    editor.current?.insertHTML(
      `<img src="${escapeHTML(checked)}" alt="" referrerpolicy="no-referrer">`,
    );
    setImageURL("");
    setOpen(null);
  }

  async function addImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const media = await uploadMedia({
        file,
        purpose: "chapter_image",
        novel: novelRef,
      });
      // The alt text starts as the file's own name: a description the author can
      // replace, rather than an empty alt shipped to a screen reader.
      const alt = file.name.replace(/\.[^.]+$/, "");
      editor.current?.insertHTML(
        `<img src="${escapeHTML(media.url)}" alt="${escapeHTML(alt)}">`,
      );
    } catch (cause) {
      setUploadError(
        cause instanceof ApiError ? cause.message : "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <ToolButton label="ย้อนกลับ" onClick={() => editor.current?.command("undo")}>
          <Icon name="undo" size={16} />
        </ToolButton>
        <ToolButton label="ทำซ้ำ" onClick={() => editor.current?.command("redo")}>
          <Icon name="redo" size={16} />
        </ToolButton>

        <Divider />
        {INLINE_TOOLS.map((tool) => (
          <ToolButton
            key={tool.key}
            label={tool.label}
            onClick={() => run(tool)}
            active={active[tool.command]}
            className={tool.className}
          >
            {tool.icon ? <Icon name={tool.icon} size={16} /> : tool.glyph}
          </ToolButton>
        ))}

        <Divider />
        {BLOCK_TOOLS.map((tool) => (
          <ToolButton
            key={tool.key}
            label={tool.label}
            onClick={() => run(tool)}
            active={active[tool.command]}
          >
            {tool.icon ? <Icon name={tool.icon} size={16} /> : tool.glyph}
          </ToolButton>
        ))}

        <Divider />
        {ALIGN_TOOLS.map((tool) => (
          <ToolButton
            key={tool.key}
            label={tool.label}
            onClick={() => run(tool)}
            active={active[tool.command]}
          >
            {tool.icon ? <Icon name={tool.icon} size={16} /> : tool.glyph}
          </ToolButton>
        ))}
        {/*
          ล้างรูปแบบ, where the manual indent button used to be.
          ย่อหน้าอัตโนมัติ is a display rule now (§13Q), so a button that typed
          an indent would insert characters that changed nothing on screen.
          What a writer actually needs here is the opposite: text dragged in
          from another site arrives wearing that site's formatting, and this is
          the one press that takes it off without touching a word of it.
        */}
        <ToolButton
          label="ล้างรูปแบบ"
          onClick={() => editor.current?.command("removeFormat")}
        >
          <Icon name="eraser" size={16} />
        </ToolButton>

        <Divider />

        <Popover
          panel="colour"
          open={open}
          onToggle={toggle}
          label="สีตัวอักษร"
          trigger={
            <span className="flex flex-col items-center leading-none">
              <span className="text-[13px] font-semibold">A</span>
              <span className="mt-0.5 h-[3px] w-4 rounded-sm bg-[var(--content-red)]" />
            </span>
          }
        >
          <Swatches
            names={TEXT_COLOURS}
            labelOf={(name) => TEXT_COLOUR_LABELS[name]}
            swatchClass={(name) => `ft-${name} bg-current`}
            onPick={(name) => paint(`ft-${name}`)}
            onClear={() => paint(null)}
          />
        </Popover>

        <Popover
          panel="mark"
          open={open}
          onToggle={toggle}
          label="ไฮไลต์"
          trigger={<Icon name="highlighter" size={16} />}
        >
          <Swatches
            names={MARK_COLOURS}
            labelOf={(name) => MARK_COLOUR_LABELS[name]}
            swatchClass={(name) => `ft-mark-${name}`}
            onPick={(name) => paint(`ft-mark-${name}`)}
            onClear={() => paint(null)}
          />
        </Popover>

        <Divider />

        <Popover
          panel="link"
          open={open}
          onToggle={toggle}
          label="ลิงก์"
          trigger={<Icon name="external" size={16} />}
        >
          <form onSubmit={addLink} className="w-72">
            <label htmlFor="format-link" className="mono-label block">
              ลิงก์ไปที่
            </label>
            <input
              id="format-link"
              value={href}
              onChange={(event) => {
                setHref(event.target.value);
                setLinkError(null);
              }}
              placeholder="https://…"
              className="mt-1.5 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
            />
            {linkError ? (
              <p role="alert" className="mt-1.5 text-xs text-error">
                {linkError}
              </p>
            ) : null}
            <button
              type="submit"
              className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-white hover:opacity-90"
            >
              ใส่ลิงก์
            </button>
          </form>
        </Popover>

        <Popover
          panel="image"
          open={open}
          onToggle={toggle}
          label="แทรกรูปภาพ"
          trigger={<Icon name="image" size={16} />}
        >
          <div className="w-72">
            <button
              type="button"
              disabled={uploading}
              onClick={() => picker.current?.click()}
              className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Icon name="image" size={14} />
              {uploading ? "กำลังอัปโหลด…" : "อัปโหลดจากเครื่อง"}
            </button>

            {/*
              A picture that already lives somewhere else.

              This used to be impossible: the renderer admitted our own media
              route and nothing else, so a URL pasted from another site turned
              into its alt text the moment the chapter was saved - which looks
              exactly like the platform eating the author's picture. Remote
              images are allowed now, and the host is told nothing about which
              chapter is open (`referrerpolicy=no-referrer`).
            */}
            <form onSubmit={addImageURL} className="mt-3 border-t border-hairline pt-3">
              <label htmlFor="format-image-url" className="mono-label block">
                หรือวางลิงก์รูปจากเว็บอื่น
              </label>
              <input
                id="format-image-url"
                value={imageURL}
                onChange={(event) => {
                  setImageURL(event.target.value);
                  setUploadError(null);
                }}
                placeholder="https://…"
                className="mt-1.5 min-h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-text"
              >
                แทรกรูปจากลิงก์
              </button>
              <p className="mt-2 text-xs text-text-muted">
                รูปจากเว็บอื่นจะหายถ้าเว็บนั้นลบไฟล์ทิ้ง - อัปโหลดเองปลอดภัยกว่า
              </p>
            </form>
          </div>
        </Popover>
        <input
          ref={picker}
          type="file"
          accept={MEDIA_ACCEPT}
          onChange={addImage}
          className="hidden"
        />

        <Popover
          panel="emoji"
          open={open}
          onToggle={toggle}
          label="อีโมจิ"
          trigger={<Icon name="smile" size={16} />}
        >
          <div className="grid w-64 grid-cols-8 gap-0.5">
            {EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                onClick={() => {
                  editor.current?.insertText(emoji);
                  setOpen(null);
                }}
                className="flex size-7 items-center justify-center rounded hover:bg-surface-secondary"
              >
                {emoji}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            อีโมจิเป็นตัวอักษรปกติ พิมพ์จากแป้นพิมพ์เองก็ได้
          </p>
        </Popover>

        <Divider />

        {/*
          The platform's own moves, worn on the sleeve (editor review 2026-08
          C). แทรกตัวแปร lived two popovers deep - press ⊕, then press again -
          which read as "this editor has no reader variables". These are the
          buttons no other editor has, so they are the ones that carry words
          instead of hiding behind an icon.
        */}
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.current?.command("insertHorizontalRule")}
          title="เส้นคั่นเมื่อเปลี่ยนฉากหรือเวลา"
          className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50/60 px-2.5 text-xs font-medium text-primary hover:border-primary hover:bg-primary-50"
        >
          <Icon name="minus" size={14} />
          คั่นฉาก
        </button>
        {children}
      </div>

      {/*
        The image row (§13S).

        It appears when a picture is selected and nowhere else. An image is the
        one thing in a manuscript a writer cannot select by dragging across it,
        so clicking one selects it - and until this row existed, the alignment
        buttons acted on a caret that was not in the image and appeared to do
        nothing at all.
      */}
      {imagePicked ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2">
          <span className="mono-label">รูปที่เลือก</span>

          <span className="flex items-center gap-0.5">
            {ALIGN_TOOLS.map((tool) => (
              <ToolButton
                key={`image-${tool.key}`}
                label={`รูป${tool.label}`}
                onClick={() => run(tool)}
                active={active[tool.command]}
              >
                {tool.icon ? <Icon name={tool.icon} size={16} /> : tool.glyph}
              </ToolButton>
            ))}
          </span>

          <Divider />

          <span className="flex items-center gap-1">
            {IMAGE_WIDTHS.map((width) => (
              <button
                key={width}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyImageWidth(width)}
                className={`min-h-8 rounded-md border px-2.5 text-xs ${
                  imageWidth === width
                    ? "border-primary text-primary"
                    : "border-border text-text-secondary hover:border-primary hover:text-primary"
                }`}
              >
                {width}%
              </button>
            ))}
          </span>

          {/* Any size, not just the presets (editor review 2026-08 item 1).
              The manuscript already stores a continuous percentage - only the
              buttons were quantised. */}
          <span className="flex items-center gap-2">
            <input
              type="range"
              aria-label="ขนาดรูป (เปอร์เซ็นต์ของคอลัมน์)"
              min={MIN_IMAGE_WIDTH}
              max={MAX_IMAGE_WIDTH}
              step={1}
              value={imageWidth}
              onMouseDown={(event) => event.stopPropagation()}
              onChange={(event) => applyImageWidth(Number(event.target.value))}
              className="w-32 accent-primary"
            />
            <span className="w-10 font-mono text-xs text-text-secondary tabular-nums">
              {imageWidth}%
            </span>
          </span>

          <p className="ms-auto text-xs text-text-muted">
            คลิกที่รูปเพื่อเลือก · คลิกที่ข้อความเพื่อเลิกเลือก
          </p>
        </div>
      ) : null}

      {uploadError ? (
        <p role="alert" className="border-t border-hairline px-3 py-2 text-xs text-error">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}

/** The editor's DOM is built from strings, so what goes in is escaped. */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One colour row: the palette, then a way back to no colour at all. */
function Swatches<T extends string>({
  names,
  labelOf,
  swatchClass,
  onPick,
  onClear,
}: {
  names: readonly T[];
  labelOf: (name: T) => string;
  swatchClass: (name: T) => string;
  onPick: (name: T) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-52">
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            aria-label={labelOf(name)}
            title={labelOf(name)}
            onClick={() => onPick(name)}
            className="flex size-7 items-center justify-center rounded-md border border-border hover:border-primary"
          >
            <span className={`size-4 rounded-sm ${swatchClass(name)}`} />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 inline-flex min-h-8 w-full items-center justify-center rounded-md border border-border px-2 text-xs text-text-secondary hover:text-text"
      >
        เอาสีออก
      </button>
      <p className="mt-2 text-xs text-text-muted">
        สีมาจากชุดของแพลตฟอร์ม อ่านได้ทั้งธีมสว่างและธีมมืด
      </p>
    </div>
  );
}

function Popover({
  panel,
  open,
  onToggle,
  label,
  trigger,
  children,
}: {
  panel: string;
  open: string | null;
  onToggle: (panel: string) => void;
  label: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="relative">
      <ToolButton label={label} expanded={open === panel} onClick={() => onToggle(panel)}>
        {trigger}
      </ToolButton>
      {open === panel ? (
        <span className="absolute start-0 top-full z-10 mt-1 block rounded-md border border-border bg-surface p-2 shadow-lg">
          {children}
        </span>
      ) : null}
    </span>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-hairline" />;
}

function ToolButton({
  children,
  label,
  onClick,
  className = "",
  expanded,
  active,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  expanded?: boolean;
  /** Whether the command is already on at the caret. Undefined = not a toggle. */
  active?: boolean;
}) {
  return (
    <button
      // Never a submit: this toolbar sits inside editors that are forms.
      type="button"
      // The selection is what most of these act on, and a button that took
      // focus would collapse it before the click ever ran.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      aria-pressed={active}
      title={label}
      className={`flex size-9 items-center justify-center rounded-md text-sm ${
        active
          ? "bg-primary-50 text-primary"
          : "text-text-secondary hover:bg-surface-secondary hover:text-text"
      } ${className}`}
    >
      {children}
    </button>
  );
}
