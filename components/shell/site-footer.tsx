import Link from "next/link";

import { PageContainer } from "@/components/shell/page-container";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * The site footer.
 *
 * Dark and typographic, capped by a coral rule - the one place the accent is
 * allowed to run the full width of the page. It ends the document rather than
 * decorating it, which is what keeps the reading surfaces above it calm.
 *
 * Reworked after the home review (2026-08): the legal links a fiction platform
 * cannot ship without now exist and are linked - terms, privacy, community
 * guidelines, the 18+ content policy, and above all the copyright/takedown
 * channel. The AI stance ("งานคุณไม่ถูกใช้ฝึก AI") is a permanent footer link
 * because it is a selling point, not a settings footnote. The theme switch
 * moved to the bottom bar beside the copyright, where site chrome belongs.
 *
 * No social links: no official accounts exist yet, and icons that lead
 * nowhere are worse than none. Add them here when the accounts are real.
 */

const COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "สำหรับผู้อ่าน",
    links: [
      { href: "/explore", label: "สำรวจนิยาย" },
      { href: "/novels?preset=popular", label: "ยอดนิยม" },
      { href: "/novels?preset=completed", label: "จบแล้ว อ่านรวดเดียว" },
      { href: "/search", label: "ค้นหาแบบละเอียด" },
      { href: "/library", label: "ชั้นหนังสือของฉัน" },
    ],
  },
  {
    heading: "สำหรับนักเขียน",
    links: [
      { href: "/studio/novels/new", label: "เริ่มเขียนเรื่องแรก" },
      { href: "/studio", label: "สตูดิโอนักเขียน" },
      // The platform's differentiator, advertised where it costs nothing.
      { href: "/formats", label: "คู่มือรูปแบบการนำเสนอ" },
      { href: "/settings/ai", label: "ตัวช่วยเขียนภาษาไทย" },
      { href: "/pricing", label: "แพ็กเกจสมาชิก" },
    ],
  },
  {
    // Five links, same as the other two columns - ติดต่อทีมงาน moved to the
    // bottom bar so the grid lines up (review round 2).
    heading: "ชุมชนและนโยบาย",
    links: [
      { href: "/community", label: "ชุมชนนักอ่าน" },
      { href: "/policies/about", label: "เกี่ยวกับเรา" },
      { href: "/policies/guidelines", label: "แนวปฏิบัติของชุมชน" },
      { href: "/policies/content-policy", label: "นโยบายเนื้อหา 18+" },
      { href: "/policies/takedown", label: "แจ้งลบ / ละเมิดลิขสิทธิ์" },
    ],
  },
];

/** The bottom bar's legal row - short names, every one a real page. */
const LEGAL_LINKS = [
  { href: "/policies/terms", label: "เงื่อนไขการใช้งาน" },
  { href: "/policies/privacy", label: "ความเป็นส่วนตัว" },
  { href: "/policies/ai", label: "จุดยืนเรื่อง AI" },
  { href: "/policies/security", label: "รายงานช่องโหว่" },
  { href: "/contact", label: "ติดต่อทีมงาน" },
];

export function SiteFooter() {
  return (
    <footer className="mt-18 border-t-[3px] border-t-secondary bg-[#292731] text-[#e7e4eb]">

      <PageContainer measure="shell" className="py-11">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <div>
            <p className="flex items-baseline gap-1.5 font-serif text-xl font-semibold">
              FictionThai
            </p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#a09ca8]">
              แพลตฟอร์มนิยายไทยที่ให้นักเขียนเป็นเจ้าของงานของตัวเอง
              และให้นักอ่านเริ่มอ่านได้ทันทีโดยไม่ต้องสมัครสมาชิก
            </p>
            {/* The stance, stated where every page ends - it is the platform's
                promise, and a promise belongs somewhere permanent. */}
            <Link
              href="/policies/ai"
              className="mt-4 inline-flex items-center text-sm text-[#c9c4d4] underline decoration-[#8f8a99] underline-offset-4 hover:text-white"
            >
              งานของคุณไม่ถูกใช้ฝึก AI - อ่านจุดยืนของเรา
            </Link>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="mono-label text-[#8f8a99]">{column.heading}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[#c9c4d4] hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

      </PageContainer>

      <div className="bg-[#211f29]">
        <PageContainer
          measure="shell"
          className="flex flex-wrap items-center gap-x-5 gap-y-3 py-4 text-xs text-[#8f8a99]"
        >
          {/* Gregorian, per the project owner's call (review round 2) - the
              convention for a © line even beside th-TH-formatted dates. */}
          <span>© {new Date().getFullYear()} FictionThai</span>
          <span>งานเขียนทั้งหมดเป็นลิขสิทธิ์ของผู้เขียนแต่ละคน</span>
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-white">
              {link.label}
            </Link>
          ))}
          <span className="ms-auto">
            <ThemeToggle />
          </span>
        </PageContainer>
      </div>
    </footer>
  );
}
