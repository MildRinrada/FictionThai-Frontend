"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The account-settings tabs.
 *
 * ตั้งค่าผู้ช่วยเขียน used to be a floating page under /studio with a
 * "กลับหน้าแรก" link - reachable, but belonging to nothing. These tabs make
 * every account-level settings surface a sibling of the others, and give each
 * page the same answer to "แล้วหน้าตั้งค่าอื่นอยู่ไหน".
 */
const TABS = [
  { href: "/settings/profile", label: "โปรไฟล์และบัญชี" },
  { href: "/settings/ai", label: "ผู้ช่วยเขียน" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="หมวดตั้งค่า" className="flex gap-1 border-b border-hairline">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3.5 text-sm ${
              active
                ? "border-primary font-medium text-primary"
                : "border-transparent text-text-secondary hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
