"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The studio rail's section navigation.
 *
 * A client island purely for the active state - the same reason as the header's
 * NavLink. The active marker is a 3px rule on the leading edge plus a tinted
 * fill, and `aria-current` carries the meaning independently of both.
 */

const SECTIONS = [
  { segment: "", label: "ภาพรวม" },
  { segment: "/chapters", label: "ตอนทั้งหมด" },
  { segment: "/characters", label: "ตัวละคร" },
  // §13R - the posts that attached this fiction, where its author can find
  // them. It sits before ตั้งค่าเรื่อง because it is something to READ, and
  // settings is the one section a writer visits deliberately.
  { segment: "/community", label: "โพสต์ชุมชน" },
  { segment: "/settings", label: "ตั้งค่าเรื่อง" },
];

export function StudioNav({ base }: { base: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="เมนูสตูดิโอ" className="mt-5 flex flex-col border-t border-hairline">
      {SECTIONS.map((section) => {
        const href = `${base}${section.segment}`;
        // The overview owns the bare path; every other section owns its subtree
        // so an open chapter keeps "ตอนทั้งหมด" lit.
        const active =
          section.segment === ""
            ? pathname === base
            : pathname.startsWith(href);

        return (
          <Link
            key={section.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`border-b border-hairline border-s-3 px-3 py-2.5 text-sm ${
              active
                ? "border-s-primary bg-primary-50 font-medium text-primary"
                : "border-s-transparent text-text-secondary hover:text-text"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
