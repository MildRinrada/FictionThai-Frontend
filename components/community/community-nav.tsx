import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The community's left-hand navigation (docs/COMMUNITY-FEED.md): what used to
 * be a chip row in the feed column, moved out so the feed keeps its width.
 * A Server Component of plain links - each entry is a shareable address, and
 * the row works before hydration.
 *
 * On mobile it renders as a horizontal scroller above the feed; from lg up it
 * is a sticky column.
 */

export interface CommunityNavEntry {
  key: string;
  label: string;
  href: string;
  icon: IconName;
}

export const COMMUNITY_NAV: CommunityNavEntry[] = [
  { key: "all", label: "ฟีดทั้งหมด", href: "/community", icon: "home" },
  { key: "following", label: "กำลังติดตาม", href: "/community?feed=following", icon: "users" },
  { key: "attached", label: "โพสต์ที่แนบเรื่อง", href: "/community?feed=attached", icon: "paperclip" },
  { key: "mine", label: "โพสต์ของฉัน", href: "/community?feed=mine", icon: "user" },
  { key: "saved", label: "บันทึกไว้", href: "/community?feed=saved", icon: "bookmark" },
  { key: "beta", label: "หาเบต้า/นักเขียนร่วม", href: "/community?type=beta_request", icon: "edit" },
  { key: "event", label: "อีเวนต์เขียน", href: "/community?type=event", icon: "sparkle" },
];

export function CommunityNav({ selected }: { selected: string }) {
  return (
    <nav aria-label="หมวดชุมชน">
      <ul className="scrollbar-none flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {COMMUNITY_NAV.map((entry) => {
          const current = entry.key === selected;
          return (
            <li key={entry.key} className="shrink-0 lg:shrink">
              <Link
                href={entry.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap lg:whitespace-normal ${
                  current
                    ? "bg-surface-secondary font-medium text-text"
                    : "text-text-secondary hover:bg-surface-secondary hover:text-text"
                }`}
              >
                <Icon name={entry.icon} size={15} className={current ? "text-primary" : ""} />
                {entry.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 hidden border-t border-hairline pt-3 lg:block">
        <Link
          href="/community/create"
          className="flex min-h-9 items-center justify-center rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:opacity-90"
        >
          เขียนโพสต์
        </Link>
      </div>
    </nav>
  );
}
