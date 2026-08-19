"use client";

import { useEffect, useState } from "react";

/**
 * The settings page's own table of contents (settings review 2026-08, item F;
 * round 2 item 11 made it LIVE).
 *
 * The page is eight-plus blocks and ~2,600px tall; the studio's left rail
 * navigates BETWEEN pages, so this row navigates WITHIN this one. Sticky under
 * the site header and horizontally scrollable where it does not fit.
 *
 * A client island for the two things a static row could not do: the tab of
 * the section currently on screen is highlighted (an IntersectionObserver -
 * scroll position is exactly the external system effects exist to subscribe
 * to), and a click scrolls smoothly instead of teleporting, so the reader
 * keeps their sense of where on the page they landed.
 */

const ANCHORS = [
  { id: "identity", label: "ชื่อเรื่องและปก" },
  { id: "assistant", label: "ผู้ช่วยเขียน" },
  { id: "content", label: "เนื้อหาและคำเตือน" },
  { id: "audience", label: "การมองเห็น" },
  { id: "format", label: "รูปแบบ" },
  { id: "variables", label: "ตัวแปรผู้อ่าน" },
  { id: "publishing", label: "การตีพิมพ์" },
  { id: "display", label: "การแสดงผล" },
  { id: "permissions", label: "สิทธิ์และสนับสนุน" },
  { id: "collaborators", label: "ผู้เขียนร่วม" },
  { id: "danger", label: "โซนอันตราย" },
] as const;

export function SettingsAnchors() {
  const [active, setActive] = useState<string>(ANCHORS[0].id);

  useEffect(() => {
    // The active tab is the topmost section inside the reading band - the
    // upper part of the viewport, where the heading someone is looking at
    // actually sits.
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id);
          } else {
            visible.delete(entry.target.id);
          }
        }
        const topmost = ANCHORS.find((anchor) => visible.has(anchor.id));
        if (topmost) setActive(topmost.id);
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    for (const anchor of ANCHORS) {
      const section = document.getElementById(anchor.id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);

  function go(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id);
    if (!section) return; // fall through to the plain hash jump
    event.preventDefault();
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <nav
      aria-label="ส่วนของหน้าตั้งค่า"
      className="sticky top-15 z-20 -mx-1 flex gap-1.5 overflow-x-auto border-b border-hairline bg-background/95 px-1 py-2 backdrop-blur-sm"
    >
      {ANCHORS.map((anchor) => (
        <a
          key={anchor.id}
          href={`#${anchor.id}`}
          aria-current={active === anchor.id ? "true" : undefined}
          onClick={(event) => go(event, anchor.id)}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
            active === anchor.id
              ? "border-primary bg-primary-50 font-medium text-primary"
              : "border-border text-text-secondary hover:border-primary-200 hover:text-text"
          }`}
        >
          {anchor.label}
        </a>
      ))}
    </nav>
  );
}
