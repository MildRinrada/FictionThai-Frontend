/**
 * The icon set.
 *
 * Inline SVG rather than an icon font. The prototype specified Material
 * Symbols, but that font is ~300KB even before a single glyph is used and it
 * would be a third-party request on the reader's critical path - both of which
 * docs/07 §20 and the performance principles in CLAUDE.md rule out. Inlining
 * the two dozen glyphs the product actually uses costs a few hundred bytes and
 * ships zero JavaScript.
 *
 * Everything is drawn on a 24×24 grid with a 1.6 stroke and no fill, so the
 * icons read as line-work beside the serif headings rather than as the filled
 * app-style glyphs Joylada and Dek-D use.
 */

export type IconName =
  | "search"
  | "bell"
  | "plus"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "chevron-up"
  | "arrow-right"
  | "close"
  | "menu"
  | "bookmark"
  | "heart"
  | "message"
  | "share"
  | "settings"
  | "list"
  | "type"
  | "home"
  | "compass"
  | "users"
  | "library"
  | "user"
  | "edit"
  | "more-horizontal"
  | "image"
  | "check"
  | "alert"
  | "external"
  | "clock"
  | "eye"
  | "pin"
  | "camera"
  | "flag"
  | "sparkle"
  | "paperclip"
  | "shield"
  | "undo"
  | "redo"
  | "list-ordered"
  | "minus"
  | "align-left"
  | "align-center"
  | "align-right"
  | "indent"
  | "eraser"
  | "highlighter"
  | "smile"
  | "book"
  | "trash"
  | "lock"
  | "globe"
  | "link"
  | "copy"
  | "grip"
  | "swap"
  | "filter"
  | "grid"
  | "printer";

const PATHS: Record<IconName, string> = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  bell: "M18 15V10a6 6 0 1 0-12 0v5l-2 3h16zM10 21h4",
  plus: "M12 5v14M5 12h14",
  "chevron-left": "M15 5l-7 7 7 7",
  "chevron-right": "M9 5l7 7-7 7",
  // The editor's history pair: an arrow curving back over itself, mirrored.
  undo: "M4 9h11a5 5 0 0 1 0 10h-6M4 9l4-4M4 9l4 4",
  "list-ordered": "M9 6h11M9 12h11M9 18h11M4 5h1v4M3.5 15h2l-2 2.5h2",
  minus: "M5 12h14",
  "align-left": "M4 6h16M4 10.5h9M4 15h16M4 19.5h9",
  "align-center": "M4 6h16M7.5 10.5h9M4 15h16M7.5 19.5h9",
  "align-right": "M4 6h16M11 10.5h9M4 15h16M11 19.5h9",
  indent: "M10 6h10M10 12h10M10 18h10M3.5 9l3 3-3 3",
  // ล้างรูปแบบ: a block rubbed back to bare text, with the crumbs it leaves.
  eraser: "M8.5 20l-4-4a1.5 1.5 0 0 1 0-2.1L14 4.4a1.5 1.5 0 0 1 2.1 0l3.5 3.5a1.5 1.5 0 0 1 0 2.1L10 19.6M13 20h7M7 10l7 7",
  highlighter: "M14 3.5l6.5 6.5-6 6-6.5-6.5zM8 9.5L4 13.5V17h3.5l4-4M3 21h8",
  smile: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 10h.01M15 10h.01M8.5 14a4.5 4.5 0 0 0 7 0",
  redo: "M20 9H9a5 5 0 0 0 0 10h6M20 9l-4-4M20 9l-4 4",
  "chevron-down": "M5 9l7 7 7-7",
  "chevron-up": "M5 15l7-7 7 7",
  "arrow-right": "M4 12h16M14 6l6 6-6 6",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1",
  heart:
    "M12 20S4 15.5 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.5 12 20 12 20",
  message: "M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 11 5h2a7 7 0 0 1 7 7",
  share: "M12 4v11M8 8l4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M4 12h1.4M18.6 12H20M12 4v1.4M12 18.6V20M6.6 6.6l1 1M16.4 16.4l1 1M17.4 6.6l-1 1M7.6 16.4l-1 1",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  type: "M5 7V5h14v2M12 5v14M9 19h6",
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM10 20v-6h4v6",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M15.5 8.5l-2 5-5 2 2-5z",
  shield: "M12 3l7 3v5.5c0 4.3-2.9 7.7-7 9.5-4.1-1.8-7-5.2-7-9.5V6z",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M3 20a6 6 0 0 1 12 0M16.5 11.5a3 3 0 0 0 0-6M18 20a5.6 5.6 0 0 0-2-4.3",
  library: "M5 4h5v16H5zM13 4h3v16h-3zM18.4 5l2.2 14.6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 20a7.5 7.5 0 0 1 15 0",
  edit: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17zM14.5 6.5l3 3",
  "more-horizontal": "M6 12h.01M12 12h.01M18 12h.01",
  image: "M4 5h16v14H4zM4 16l4.5-4.5 4 4L16 12l4 4M15 9h.01",
  check: "M5 13l4.5 4.5L19 7",
  alert: "M12 8v5M12 16.5h.01M12 3.5 2.5 20h19z",
  // A sheet entering a printer, tray out: the policy pages' "save a copy".
  printer:
    "M7 8V3.5h10V8M5 8h14a1.5 1.5 0 0 1 1.5 1.5V16H17.5M6.5 16H3.5V9.5A1.5 1.5 0 0 1 5 8M7 13h10v7.5H7zM17 11h.01",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5.3l3.4 2",
  eye: "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  pin: "M9 3h6l-1 6 3.5 3.5H6.5L10 9zM12 12.5V21",
  camera:
    "M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1M12 16.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4",
  flag: "M5 21V4h13l-2.5 4L18 12H5",
  sparkle: "M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z",
  paperclip:
    "M19 11.5 12.2 18.3a4.2 4.2 0 0 1-6-6l7.3-7.2a2.8 2.8 0 0 1 4 4l-7.3 7.2a1.4 1.4 0 0 1-2-2l6.6-6.5",
  book: "M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2zM11 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
  trash: "M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 1 1 7 0v3",
  globe:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3",
  link: "M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 1 0-5.7-5.7L11.6 6.7M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 1 0 5.7 5.7l1.5-1.5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  // A drag handle: two columns of three dots.
  grip: "M9.5 6h.01M9.5 12h.01M9.5 18h.01M14.5 6h.01M14.5 12h.01M14.5 18h.01",
  swap: "M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4",
  // A funnel: the filter-panel trigger on small screens.
  filter: "M4 5h16l-6 7v6l-4 2v-8z",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
};

export interface IconProps {
  name: IconName;
  /** Pixel size. Icons are drawn on a 24 grid and scale cleanly. */
  size?: number;
  className?: string;
  /**
   * Accessible name. Omit when the icon sits beside text that already names the
   * action - a decorative icon must be hidden, not announced twice (docs/05 §31).
   */
  label?: string;
}

export function Icon({ name, size = 18, className = "", label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
