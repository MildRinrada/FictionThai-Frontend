import Link from "next/link";

import { NavLink } from "@/components/shell/nav-link";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * The mobile bottom navigation - five slots, chosen by ROLE.
 *
 * docs/05 §21 fixes the count at exactly five; WHICH five is the decision here,
 * and it changed: สตูดิโอ took a slot. A writer on a phone had no way to reach
 * their own workspace except through the avatar menu, which is the same place
 * it was invisible on desktop - and "hidden behind a hamburger" is how a
 * platform ends up with writers who never find their drafts again.
 *
 * The centre slot is สร้าง, raised and coloured, because it is the one thing on
 * this bar that MAKES something rather than going somewhere. หน้าแรก and ชุมชน
 * gave up their slots: the logo already goes home, and the community is one tap
 * inside สำรวจ.
 *
 * A guest keeps all five. The centre becomes the invitation to sign in rather
 * than disappearing, because a guest must still be able to find the way in
 * (docs/10 §2.1).
 */

const READER: { href: string; label: string; icon: IconName }[] = [
  { href: "/explore", label: "สำรวจ", icon: "compass" },
  { href: "/search", label: "ค้นหา", icon: "search" },
];

export function MobileNav({
  signedIn,
  unfinished = 0,
}: {
  signedIn: boolean;
  /** ร่างที่ค้าง, mirrored from the desktop studio link. */
  unfinished?: number;
}) {
  const writer: { href: string; label: string; icon: IconName }[] = signedIn
    ? [
        { href: "/studio", label: "สตูดิโอ", icon: "edit" },
        { href: "/profile", label: "โปรไฟล์", icon: "user" },
      ]
    : [
        { href: "/community", label: "ชุมชน", icon: "users" },
        { href: "/login", label: "เข้าสู่ระบบ", icon: "user" },
      ];

  return (
    <nav
      aria-label="เมนูหลัก (มือถือ)"
      data-shell="mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm md:hidden"
    >
      <ul className="flex items-stretch">
        {READER.map((item) => (
          <li key={item.href} className="flex-1">
            <NavLink
              href={item.href}
              className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]"
              activeClassName="text-primary font-medium"
              inactiveClassName="text-text-muted"
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          </li>
        ))}

        <li className="flex flex-1 items-center justify-center">
          <Link
            href={signedIn ? "/studio/novels/new" : "/register"}
            className="flex size-12 -translate-y-2 items-center justify-center rounded-full bg-primary text-white shadow-popover"
            aria-label={signedIn ? "สร้างผลงาน" : "สร้างบัญชี"}
          >
            <Icon name="plus" size={22} />
          </Link>
        </li>

        {writer.map((item) => (
          <li key={item.href} className="flex-1">
            <NavLink
              href={item.href}
              className="relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]"
              activeClassName="text-primary font-medium"
              inactiveClassName="text-text-muted"
            >
              <span className="relative">
                <Icon name={item.icon} size={20} />
                {item.href === "/studio" && unfinished > 0 ? (
                  <span
                    aria-label={`ร่างที่ยังไม่เผยแพร่ ${unfinished} ตอน`}
                    className="absolute -top-1 -end-2 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-4 font-medium text-white tabular-nums"
                  >
                    {unfinished > 9 ? "9+" : unfinished}
                  </span>
                ) : null}
              </span>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
