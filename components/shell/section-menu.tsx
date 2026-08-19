"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";

/**
 * A top-level section that is both a destination and a menu.
 *
 * The label still goes to the section - a header link that only opens a panel
 * takes away the one thing people expect it to do. The chevron beside it opens
 * the shortcuts: the handful of questions readers actually arrive with
 * ("อะไรจบแล้วบ้าง", "มีแชทฟิกไหม") rather than a directory.
 *
 * Hover opens it on a pointer because that is what a menu bar does; the chevron
 * makes the same panel reachable by touch and by keyboard, which hover alone
 * never is.
 */

export interface SectionItem {
  href: string;
  label: string;
  /** One short line under the label, where the label alone is ambiguous. */
  hint?: string;
}

export function SectionMenu({
  href,
  label,
  items,
}: {
  href: string;
  label: string;
  items: SectionItem[];
}) {
  const pathname = usePathname();
  // Two independent reasons for the panel to be up, because they behave
  // differently. Hovering shows it and moving away hides it again; pressing the
  // chevron PINS it, so it survives the pointer leaving - which is what a touch
  // user and a keyboard user need, neither of whom can hover.
  //
  // Collapsing these into one flag is the bug that shipped first: the pointer
  // arriving at the chevron opened the panel, and the click that followed
  // toggled it straight back shut, so the arrow appeared to do nothing.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const active = pathname.startsWith(href);
  const open = hovered || pinned;

  useEffect(() => {
    if (!pinned) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setPinned(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPinned(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pinned]);

  function close() {
    setHovered(false);
    setPinned(false);
  }

  return (
    <div
      ref={wrapper}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center">
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={`inline-flex min-h-9 items-center rounded-s-md ps-2 pe-0.5 text-sm whitespace-nowrap ${
            active ? "font-medium text-text" : "text-text-secondary hover:text-text"
          }`}
        >
          {label}
        </Link>
        <button
          type="button"
          onClick={() => setPinned((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`ทางลัดใน${label}`}
          className="inline-flex min-h-9 items-center rounded-e-md pe-1.5 ps-0.5 text-text-muted hover:text-text"
        >
          <Icon name="chevron-down" size={14} />
        </button>
      </div>

      {open ? (
        <div
          role="menu"
          className="absolute inset-s-0 top-full z-50 w-64 overflow-hidden rounded-lg border border-border bg-surface pt-1 pb-1 shadow-popover"
        >
          <ul>
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  role="menuitem"
                  onClick={close}
                  className="block px-3.5 py-2 text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
                >
                  {item.label}
                  {item.hint ? (
                    <span className="mt-0.5 block text-[11px] text-text-muted">
                      {item.hint}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
