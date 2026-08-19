import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/shell/page-container";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * คู่มือรูปแบบการนำเสนอ (home review D).
 *
 * The chapter-format system is the platform's headline feature, and until now
 * the only explanation of it lived inside the create form. This page is the
 * linkable version - for the footer, for a writer deciding whether to move,
 * and for a reader wondering what "เฮดแคนอน" on a card means.
 *
 * Everything stated here mirrors docs/CONTENT-MODEL.md: prose and chat can
 * coexist in one chapter, the presentation format selects which one readers
 * SEE, and changing it never rewrites anyone's manuscript.
 */

export const metadata: Metadata = {
  title: "คู่มือรูปแบบการนำเสนอ",
  description:
    "ร้อยแก้ว แชทฟิกชัน และเฮดแคนอน - สามรูปแบบของ FictionThai และการเปลี่ยนรูปแบบโดยไม่แตะต้นฉบับ",
};

const FORMATS: Array<{
  icon: IconName;
  name: string;
  what: string;
  fit: string;
  href: string;
}> = [
  {
    icon: "book",
    name: "ร้อยแก้ว",
    what: "นิยายแบบที่คุ้นเคย - ย่อหน้า บทบรรยาย บทสนทนา พร้อมเครื่องมือจัดรูปแบบและสารบัญในตัว",
    fit: "เหมาะกับงานเล่าเรื่องทุกแนว ตั้งแต่เรื่องสั้นจบในตอนถึงมหากาพย์ร้อยตอน",
    href: "/novels?preset=standard",
  },
  {
    icon: "message",
    name: "แชทฟิกชัน",
    what: "เล่าเรื่องผ่านบทสนทนาเป็นข้อความแชท - ผู้พูดซ้าย/ขวา ข้อความระบบ และตัวคั่นฉาก",
    fit: "เหมาะกับเรื่องที่หัวใจคือเสียงของตัวละครคุยกัน อ่านเร็ว จังหวะเหมือนแอบดูแชทคนอื่น",
    href: "/novels?preset=chat",
  },
  {
    icon: "users",
    name: "เฮดแคนอน",
    what: "หัวข้อหนึ่ง ตัวละครหลายคน - แต่ละตอนคือหนึ่งประเด็น แล้วไล่คำตอบของตัวละครทีละคน",
    fit: "เหมาะกับงานแฟนด้อมสาย “ถ้าเป็นเขาจะ…” และงานที่ผู้อ่านมาเพราะตัวละคร ไม่ใช่พล็อต",
    href: "/novels?preset=headcanon",
  },
];

export default function FormatsPage() {
  return (
    <main id="main">
      <PageContainer className="py-10 pb-16">
        <nav aria-label="เส้นทาง" className="mb-6 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-text-secondary hover:text-primary"
          >
            <Icon name="chevron-left" size={15} />
            หน้าแรก
          </Link>
        </nav>

        <header className="border-b border-hairline pb-6">
          <p className="mono-label">Formats</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            คู่มือรูปแบบการนำเสนอ
          </h1>
          <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-text-secondary">
            เรื่องหนึ่งใน FictionThai เลือกได้ว่าจะให้ผู้อ่านพบมันในรูปแบบไหน -
            และเลือกใหม่ได้ทีละตอน เรื่องเดียวจึงผสมร้อยแก้วกับแชทได้
            โดยไม่ต้องแยกลงเป็นสองเรื่อง
          </p>
        </header>

        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {FORMATS.map((format) => (
            <li
              key={format.name}
              className="flex flex-col rounded-xl border border-border bg-surface p-5"
            >
              <p className="flex items-center gap-2 font-serif text-lg font-semibold">
                <Icon name={format.icon} size={18} className="text-primary" />
                {format.name}
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-text-secondary">
                {format.what}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {format.fit}
              </p>
              <Link
                href={format.href}
                className="mt-auto inline-flex items-center gap-1 pt-4 text-sm text-primary hover:underline"
              >
                ดูเรื่อง{format.name}ทั้งหมด
                <Icon name="arrow-right" size={14} />
              </Link>
            </li>
          ))}
        </ul>

        <section className="mt-10 rounded-xl border border-primary-200 bg-primary-50 p-6">
          <h2 className="font-serif text-lg font-semibold">
            เปลี่ยนรูปแบบได้ โดยไม่แตะต้นฉบับแม้แต่ตัวเดียว
          </h2>
          <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-text-secondary">
            รูปแบบการนำเสนอเป็นเพียงการเลือกว่าผู้อ่าน “เห็น” อะไร -
            ร้อยแก้วและแชทของตอนเดียวกันถูกเก็บแยกกันเสมอ
            การสลับรูปแบบไม่แปลง ไม่ลบ และไม่เขียนทับอะไรทั้งสิ้น
            สลับกลับเมื่อไหร่ ทุกอย่างอยู่ครบเหมือนเดิม
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Link
              href="/studio/novels/new"
              className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90"
            >
              เริ่มเขียนในรูปแบบที่ชอบ
            </Link>
            <Link
              href="/explore"
              className="inline-flex min-h-10 items-center rounded-md border border-primary-200 bg-surface px-4 text-sm text-primary hover:border-primary"
            >
              ไปอ่านตัวอย่างจริง
            </Link>
          </div>
        </section>
      </PageContainer>
    </main>
  );
}
