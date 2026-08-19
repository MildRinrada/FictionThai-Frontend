"use client";

import { useEffect, useState, type ReactNode } from "react";

import { count } from "@/lib/format";

/**
 * The tab row on a profile - and, when given the panels, the switch itself.
 *
 * **ผลงาน is first and is the default.** docs/06 §37 orders a writer profile
 * as avatar, display name, bio, published novels, then social activity - a
 * profile that opened on a status feed would answer "what has this person
 * said" before "what has this person written".
 *
 * **Switching never refreshes the page** (profile review follow-up 2026-08):
 * every panel arrives server-rendered on the first load, and a tab press
 * swaps them locally while the URL updates SHALLOWLY via history.pushState -
 * no server round trip, no loading flash. The tabs stay real `<a href>`s, so
 * before hydration - and for crawlers and shared links - each one is still a
 * genuine URL that renders on the server.
 *
 * A tab with nothing behind it is not shown at all: an empty row of zeroes is
 * how a profile starts looking abandoned.
 */

import {
  PROFILE_TABS,
  profileTabOf,
  type ProfileTab,
} from "@/components/profile/profile-tab";

// Re-exported for the tests and any client caller; SERVER pages import from
// "@/components/profile/profile-tab" directly.
export { PROFILE_TABS, profileTabOf };
export type { ProfileTab };

export interface ProfileTabsProps {
  basePath: string;
  active: ProfileTab;
  workCount: number;
  timelineCount: number;
  shelfCount?: number;
  /** Whether the wall is open. It has no meaningful count without a fetch,
      so its tab carries NO number (profile review 2026-08 - the boolean was
      rendering as "1"). */
  wallEnabled?: boolean;
  /** The owner sees their own sections even while empty - they can fill them. */
  isOwner?: boolean;
  /**
   * The server-rendered panel per tab. When provided, this component owns
   * the switching: inactive panels stay mounted but hidden, so a client
   * island inside one (the wall) keeps its state across switches.
   */
  panels?: Partial<Record<ProfileTab, ReactNode>>;
}

export function ProfileTabs({
  basePath,
  active: initialActive,
  workCount,
  timelineCount,
  shelfCount = 0,
  wallEnabled = false,
  isOwner = false,
  panels,
}: ProfileTabsProps) {
  const [active, setActive] = useState(initialActive);

  // Back/forward walk the tabs the user pushed - the URL stays the source
  // of truth even though switching is local.
  useEffect(() => {
    const onPop = () => {
      const raw = new URLSearchParams(window.location.search).get("tab");
      setActive(profileTabOf(raw ?? undefined));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const href = (tab: ProfileTab) => (tab === "works" ? basePath : `${basePath}?tab=${tab}`);

  function open(tab: ProfileTab) {
    return (event: React.MouseEvent) => {
      // Modified clicks (new tab, etc.) keep their browser meaning.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (tab === active) return;
      setActive(tab);
      window.history.pushState(null, "", href(tab));
    };
  }

  // The rework's slimmer row (profile review section D): กำลังเขียนอยู่
  // folded into ผลงาน as a filter chip; นามปากกา became identity chips under
  // the name; ชั้นหนังสือ is what a reader-who-does-not-write has to show;
  // โพสต์ says what the old ไทม์ไลน์ never explained.
  const all: Array<{
    tab: ProfileTab;
    label: string;
    total: number | null;
    always?: boolean;
    show?: boolean;
  }> = [
    { tab: "works", label: "ผลงาน", total: workCount, always: true },
    { tab: "shelves", label: "ชั้นหนังสือ", total: shelfCount },
    { tab: "wall", label: "กำแพงโปรไฟล์", total: null, show: wallEnabled },
    { tab: "timeline", label: "โพสต์", total: timelineCount, always: true },
  ];

  const tabs = all.filter(
    (tab) =>
      tab.always ||
      tab.show ||
      (tab.total ?? 0) > 0 ||
      isOwner ||
      tab.tab === active,
  );

  return (
    <>
      <nav aria-label="ส่วนต่าง ๆ ของโปรไฟล์" className="border-b border-hairline">
        <ul className="scrollbar-none -mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => {
            const selected = tab.tab === active;
            return (
              <li key={tab.tab}>
                <a
                  href={href(tab.tab)}
                  onClick={open(tab.tab)}
                  aria-current={selected ? "page" : undefined}
                  className={`inline-flex items-baseline gap-2 border-b-2 pb-3 text-sm whitespace-nowrap ${
                    selected
                      ? "border-primary font-medium text-text"
                      : "border-transparent text-text-secondary hover:text-text"
                  }`}
                >
                  {tab.label}
                  {tab.total !== null ? (
                    <span className="font-mono text-xs text-text-muted tabular-nums">
                      {count(tab.total)}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {panels
        ? PROFILE_TABS.map((tab) =>
            panels[tab] !== undefined ? (
              <div key={tab} hidden={tab !== active} className="mt-6">
                {panels[tab]}
              </div>
            ) : null,
          )
        : null}
    </>
  );
}
