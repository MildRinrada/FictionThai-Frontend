import Link from "next/link";

import { AccountMenu } from "@/components/shell/account-menu";
import { CreateMenu } from "@/components/shell/create-menu";
import { MobileNav } from "@/components/shell/mobile-nav";
import { NavLink } from "@/components/shell/nav-link";
import { PageContainer } from "@/components/shell/page-container";
import { SectionMenu, type SectionItem } from "@/components/shell/section-menu";
import { SiteSearch } from "@/components/shell/site-search";
import { StudioLink } from "@/components/shell/studio-link";
import { WordsToday } from "@/components/shell/words-today";
import { Icon } from "@/components/ui/icon";
import { NotificationBadge } from "@/features/notifications/notification-badge";
import { getCurrentUserOrNull } from "@/lib/auth";
import { fetchDesk } from "@/lib/desk-server";

/**
 * The application shell header, split BY ROLE.
 *
 * Left of the search box is the reader: สำรวจ · ชุมชน · ชั้นหนังสือของฉัน.
 * Right of it is the writer: สตูดิโอ · สร้างผลงาน. The two sides are what a
 * person is doing at that moment, and separating them is what makes สตูดิโอ
 * findable - it used to be a line inside the avatar menu, which is where people
 * look for settings and sign-out, not for the page they open most.
 *
 * "คลังของฉัน" is now **ชั้นหนังสือของฉัน**. On a Thai fiction site a คลัง/ชั้น
 * has always been the reader's shelf, and half of "คลังของฉัน" read as "where
 * my writing is kept" - two different rooms behind one ambiguous word.
 *
 * A Server Component. It reads the visitor once per request and, for a signed-in
 * writer, their desk - so the studio badge is part of the first paint instead of
 * arriving late and shoving the navigation sideways. JavaScript ships only for
 * the menus and the active-section highlight. The search field is a plain GET
 * form, so it works before hydration and without JavaScript.
 *
 * Guest-first (docs/10 §2.1): a signed-out visitor sees the whole site and a
 * quiet invitation, never a wall.
 */

/** อ่านอะไรดี - the questions readers actually arrive with. */
const EXPLORE_ITEMS: SectionItem[] = [
  { href: "/explore", label: "แนะนำวันนี้" },
  { href: "/novels?preset=latest", label: "เรื่องมาใหม่" },
  {
    href: "/novels?preset=completed",
    label: "จบแล้ว",
    hint: "อ่านรวดเดียวจบ ไม่ต้องรอตอนใหม่",
  },
  { href: "/novels?preset=oneshot", label: "จบในตอนเดียว" },
  { href: "/novels?preset=standard", label: "ร้อยแก้ว" },
  { href: "/novels?preset=chat", label: "แชทล้วน" },
  { href: "/novels?preset=headcanon", label: "เฮดแคนอน" },
];

/** The community's own feeds, named by what is in them. */
const COMMUNITY_ITEMS: SectionItem[] = [
  { href: "/community", label: "โพสต์ล่าสุด" },
  { href: "/community?feed=following", label: "ฟีดคนที่ติดตาม" },
  { href: "/community?feed=attached", label: "โพสต์ที่แนบเรื่อง" },
  { href: "/community/create", label: "เขียนโพสต์ใหม่" },
];

export async function SiteHeader() {
  const user = await getCurrentUserOrNull();
  // Only a signed-in visitor has a desk, and asking for one as a guest would be
  // a guaranteed 401 on every public page.
  const desk = user ? await fetchDesk() : null;

  return (
    <>
      <header
        data-shell="header"
        className="sticky top-0 z-40 border-b border-border bg-background/92 backdrop-blur-sm"
      >
        {/*
          THREE ZONES on a grid, not one flex row (navbar review): with
          `1fr auto 1fr` the search sits at the true centre of the bar
          whatever the reader menu weighs, and the search keeps its own fixed
          measure instead of stretching into whatever is left.

          Spacing says grouping: 8px INSIDE a group, ~20px BETWEEN groups -
          which is also why there is no divider line any more.
        */}
        <PageContainer
          measure="shell"
          className="grid h-15 grid-cols-[1fr_auto_1fr] items-center gap-3"
        >
          {/* โซนซ้าย - the reader. */}
          <div className="flex min-w-0 items-center">
            <Link
              href="/"
              className="me-5 flex shrink-0 items-baseline gap-1.5 font-serif text-lg font-semibold tracking-tight lg:me-9"
            >
              FictionThai
            </Link>

            <nav aria-label="เมนูผู้อ่าน" className="hidden shrink-0 items-center gap-1 md:flex">
              <SectionMenu href="/explore" label="สำรวจ" items={EXPLORE_ITEMS} />
              <SectionMenu href="/community" label="ชุมชน" items={COMMUNITY_ITEMS} />
              <NavLink
                href="/library"
                className="inline-flex min-h-9 items-center rounded-md px-2 text-sm whitespace-nowrap"
              >
                ชั้นหนังสือของฉัน
              </NavLink>
            </nav>
          </div>

          {/* โซนกลาง - the search, dead centre at a fixed measure. */}
          <div className="hidden w-[min(30rem,38vw)] sm:block">
            <SiteSearch signedIn={user !== null} />
          </div>
          {/* Below sm the centre track collapses; MobileNav carries search. */}
          <span className="sm:hidden" aria-hidden />

          {/* โซนขวา - the writer's tools, then the account. */}
          <div className="flex min-w-0 items-center justify-end gap-2">
            {user ? (
              <>
                <div className="hidden items-center gap-2 md:flex">
                  <WordsToday words={desk?.words_today ?? 0} />
                  <StudioLink unfinished={desk?.unfinished ?? 0} />
                </div>
                <CreateMenu recent={desk?.recent ?? []} resume={desk?.resume} />

                {/* The BETWEEN-groups gap: tools end here, the account
                    begins. แต้ม/กาชา's reserved seat moved into the account
                    menu (navbar review) - five items in a row was a crowd. */}
                <div className="ms-3 flex items-center gap-2">
                  <Link
                    href="/notifications"
                    aria-label="การแจ้งเตือน"
                    className="relative flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-secondary"
                  >
                    <Icon name="bell" size={18} />
                    <span className="absolute -top-0.5 -end-1">
                      <NotificationBadge />
                    </span>
                  </Link>
                  <AccountMenu
                    displayName={user.display_name ?? user.username}
                    avatarUrl={user.avatar_url}
                    username={user.username}
                  />
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center rounded-md px-3 text-sm text-text-secondary hover:bg-surface-secondary hover:text-text"
                >
                  เข้าสู่ระบบ
                </Link>
                <Link
                  href="/register"
                  className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
                >
                  สร้างบัญชี
                </Link>
              </>
            )}
          </div>
        </PageContainer>
      </header>

      <MobileNav signedIn={user !== null} unfinished={desk?.unfinished ?? 0} />
    </>
  );
}
