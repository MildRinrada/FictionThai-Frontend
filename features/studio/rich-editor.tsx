"use client";

import { useCallback, useEffect, useRef } from "react";

import { fromDOM, toHTML } from "@/lib/markup-dom";

/**
 * The writing surface, live (§13N).
 *
 * A `contenteditable`, so bold LOOKS bold while it is being typed. What is
 * stored is unchanged - `fromDOM` serialises back to the marked-up text §13N
 * defined on every input, so there is still no HTML on the write path and still
 * nothing to sanitize.
 *
 * The load-bearing detail is that the DOM is built ONCE, from `initialValue`,
 * and never re-rendered from state afterwards. React re-rendering a
 * contenteditable under a caret would move the caret to the end on every
 * keystroke, which is the classic way this component is got wrong. The browser
 * owns the DOM between mounts; this component owns only the text that comes out
 * of it.
 *
 * Every command goes through `execCommand`, which is deprecated and is still
 * the only API that edits a contenteditable while keeping the browser's own
 * undo history and its IME handling. Ctrl+Z works the same before and after a
 * bold, and the toolbar's undo button drives that same stack.
 *
 * ย่อหน้าอัตโนมัติ is NOT here any more (§13Q). It used to type two ideographic
 * spaces at the start of every paragraph, which meant the indent could be
 * deleted by accident, never appeared on pasted text, and had to be re-inserted
 * on every Enter. It is a CSS rule on `.ft-editor p` now - always true, never
 * part of the manuscript, and identical to what the reader is served.
 */

export interface RichEditorHandle {
  /** Runs a command against the surface, focusing it first. */
  command: (name: string, value?: string) => void;
  /** Replaces the selection with HTML, through the undo stack. */
  insertHTML: (html: string) => void;
  /** Replaces the selection with plain text, through the undo stack. */
  insertText: (text: string) => void;
  /** The live element, for a command that needs it. */
  element: () => HTMLDivElement | null;
  /** The picture the writer has clicked, if any (§13S). */
  pickedImage: () => HTMLImageElement | null;
  /**
   * Resizes the picked image, as a share of the column. `null` clears the
   * width and returns it to its natural size.
   */
  resizeImage: (percent: number | null) => void;
}

/** The elements each inline toggle wraps its text in. */
const INLINE_TOGGLE_TAGS: Record<string, readonly string[]> = {
  bold: ["B", "STRONG"],
  italic: ["I", "EM"],
  underline: ["U"],
  strikeThrough: ["S", "STRIKE", "DEL"],
  subscript: ["SUB"],
  superscript: ["SUP"],
};

/**
 * When an inline toggle runs on a COLLAPSED caret that sits inside its own
 * element, the selection grows to that element first - so the command removes
 * the formatting from the whole run instead of silently arming a typing state
 * nobody can see. A caret outside any such element is left alone: the toggle
 * then applies to what gets typed next, as it always has.
 */
function expandCollapsedToggle(root: HTMLElement, command: string) {
  const tags = INLINE_TOGGLE_TAGS[command];
  if (!tags) return;
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

  let node: Node | null = selection.anchorNode;
  while (node && node !== root) {
    if (node instanceof Element && tags.includes(node.tagName)) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    node = node.parentNode;
  }
}

export function RichEditor({
  id,
  initialValue,
  onChange,
  handleRef,
  placeholder,
  className = "min-h-104 p-5 font-serif text-[17px] leading-loose",
  ariaLabel = "เนื้อหาตอน",
  onFocus,
}: {
  id: string;
  /** The manuscript to open. Changes to it after mount are IGNORED - see above. */
  initialValue: string;
  onChange: (markdown: string) => void;
  handleRef: React.RefObject<RichEditorHandle | null>;
  placeholder?: string;
  /** Sizing only. The block rhythm comes from `.ft-editor`. */
  className?: string;
  ariaLabel?: string;
  /**
   * Told when this surface takes focus, so a toolbar shared between several
   * editors knows which one it is pointing at (§13R).
   */
  onFocus?: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);

  /**
   * The last selection that lived INSIDE this surface (editor review 2026-08
   * item 2). A toolbar press used to act on wherever `focus()` happened to
   * drop the caret - the start of the document, if the writer had not clicked
   * into the prose yet - so ขีดเส้นใต้ and คั่นฉาก appeared to do nothing, or
   * did it thousands of pixels above the viewport. Remembering the range makes
   * every command land where the writer last was.
   */
  const lastRange = useRef<Range | null>(null);

  useEffect(() => {
    function remember() {
      const node = surface.current;
      const selection = window.getSelection?.();
      if (!node || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (node.contains(range.commonAncestorContainer)) {
        lastRange.current = range.cloneRange();
      }
    }
    document.addEventListener("selectionchange", remember);
    return () => document.removeEventListener("selectionchange", remember);
  }, []);

  // The document is seeded once. `initialValue` is deliberately absent from the
  // dependencies: re-seeding while someone is typing would discard their caret
  // and, mid-keystroke, their last character.
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    node.innerHTML = toHTML(initialValue);
    // Tags rather than inline styles, so `fromDOM` reads <b> instead of a span
    // carrying a font-weight it would have to guess the meaning of.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      // Not every environment implements it; the serializer copes either way.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publish = useCallback(() => {
    const node = surface.current;
    if (node) onChange(fromDOM(node));
  }, [onChange]);

  /**
   * Focuses the surface and, when focus was elsewhere, restores the last
   * selection that lived here - so a command always has a real target.
   *
   * The decision is made from `activeElement` BEFORE focusing, and the stored
   * range is cloned first: focusing a contenteditable resets its selection to
   * the start, so any check made after `focus()` sees a selection that looks
   * legitimately "inside" while actually pointing at the document's first
   * character - which is exactly where คั่นฉาก kept landing.
   */
  const aim = useCallback(() => {
    const node = surface.current;
    if (!node) return;
    const wasFocused = document.activeElement === node;
    const stored = lastRange.current ? lastRange.current.cloneRange() : null;
    node.focus();
    if (wasFocused) return;
    const selection = window.getSelection?.();
    if (!selection || !stored || !node.contains(stored.commonAncestorContainer)) return;
    try {
      selection.removeAllRanges();
      selection.addRange(stored);
    } catch {
      // A range invalidated by an edit cannot be restored - the focused
      // caret is still a better target than another element's.
    }
  }, []);

  useEffect(() => {
    handleRef.current = {
      command(name, value) {
        aim();
        // A toggle pressed on a bare caret INSIDE its own formatting takes
        // the whole run off (editor review 2026-08 item 2): an underline in
        // the wrong place used to demand re-selecting it to the character
        // before U would remove it. The caret being in it is selection enough.
        const node = surface.current;
        if (node) expandCollapsedToggle(node, name);
        try {
          document.execCommand(name, false, value);
        } catch {
          // A command this browser does not implement is a button that does
          // nothing, never a broken editor.
        }
        publish();
      },
      insertHTML(html) {
        aim();
        try {
          document.execCommand("insertHTML", false, html);
        } catch {
          /* see above */
        }
        publish();
      },
      insertText(text) {
        aim();
        try {
          document.execCommand("insertText", false, text);
        } catch {
          /* see above */
        }
        publish();
      },
      element: () => surface.current,
      pickedImage: () =>
        surface.current?.querySelector<HTMLImageElement>("img[data-picked]") ?? null,
      resizeImage(percent) {
        const image = surface.current?.querySelector<HTMLImageElement>(
          "img[data-picked]",
        );
        if (!image) return;
        // A direct style write rather than execCommand: no browser command
        // sizes an image, and the serializer reads `style.width` back out.
        // It costs the browser's undo entry for this one edit, which is why
        // it is the only thing done this way.
        if (percent === null) {
          image.style.removeProperty("width");
        } else {
          image.style.width = `${percent}%`;
        }
        publish();
      },
    };
  }, [aim, handleRef, publish]);

  /**
   * Clicking a picture - or a คั่นฉาก rule - SELECTS it (§13R, editor review
   * 2026-08 item 2).
   *
   * An image is the one thing in a manuscript a writer cannot select by
   * dragging across it - the pointer lands beside it, not on it, so every
   * alignment button acted on an empty caret and appeared to do nothing. A
   * click puts a range around the node, which is what `justifyCenter` needs,
   * and the outline says out loud that something is selected. An <hr> has the
   * same problem with deletion: the caret cannot land on it, so until it
   * could be clicked there was no way to select it and press Backspace.
   */
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const node = surface.current;
    if (!node) return;

    for (const picked of Array.from(node.querySelectorAll("[data-picked]"))) {
      picked.removeAttribute("data-picked");
    }

    const target = event.target as HTMLElement;
    if ((target.tagName !== "IMG" && target.tagName !== "HR") || !node.contains(target)) {
      return;
    }

    event.preventDefault();
    target.setAttribute("data-picked", "true");

    // FOCUS FIRST, then set the range. Focusing a contenteditable moves the
    // selection into it, so doing it afterwards threw away the range that had
    // just been built - which is why the alignment buttons appeared to do
    // nothing at all when an image was clicked.
    node.focus();
    const range = document.createRange();
    range.selectNode(target);
    const selection = window.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);

    // The toolbar reads the picked image on the next tick, so it has to be
    // told something changed - a click that only moves the selection does not
    // fire `input`.
    document.dispatchEvent(new Event("selectionchange"));
  }

  return (
    <div
      id={id}
      ref={surface}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onInput={publish}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      className={`ft-editor w-full rounded-lg border border-border bg-surface outline-none focus:border-primary ${className}`}
    />
  );
}
