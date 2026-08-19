import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/shell/page-container";

/**
 * The community guidelines (docs/COMMUNITY-FEED.md) - the full wording behind
 * the sidebar's three-line rules card. Static prose, readable by guests.
 */

export const metadata: Metadata = {
  title: "แนวปฏิบัติของชุมชน",
  description: "กติกาการอยู่ร่วมกันในชุมชน FictionThai",
};

export default function CommunityGuidelinesPage() {
  return (
    <main id="main">
      <PageContainer className="py-10 pb-16">
        <header className="border-b border-hairline pb-6">
          <p className="mono-label">Community Guidelines</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            แนวปฏิบัติของชุมชน
          </h1>
          <p className="mt-2 max-w-prose text-sm text-text-secondary">
            ชุมชนนี้มีไว้ให้นักเขียนและนักอ่านคุยกันเรื่องงานเขียนอย่างสบายใจ
            กติกาทั้งหมดสรุปได้สามข้อ และขยายความไว้ด้านล่าง
          </p>
        </header>

        <div className="mt-8 max-w-prose space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-serif text-lg font-semibold">1. เคารพกัน</h2>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-text-secondary">
              <li>วิจารณ์งานได้เต็มที่ แต่ไม่โจมตีตัวคนเขียน</li>
              <li>ไม่คุกคาม ไล่ตาม หรือรุมใครทั้งในและนอกแพลตฟอร์ม</li>
              <li>ความเห็นต่างเรื่องคู่ เรื่องแนว เรื่องรสนิยม เป็นเรื่องปกติ - ไม่ต้องให้ใครแพ้</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg font-semibold">
              2. สปอยล์และเนื้อหา 18+ ต้องบอกล่วงหน้า
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-text-secondary">
              <li>จะคุยจุดหักมุมของเรื่องไหน บอกชื่อเรื่องและเตือนสปอยล์ก่อน</li>
              <li>โพสต์ที่แนบเรื่อง 18+ จะติดป้ายเรตให้อัตโนมัติ แต่เนื้อความในโพสต์เองก็ต้องไม่เกินเรตพื้นที่รวม</li>
              <li>ใช้ฟีเจอร์ซ่อนคำ (mute) ได้ ถ้าไม่อยากเห็นสปอยล์เรื่องที่ยังอ่านไม่จบ</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg font-semibold">
              3. งานของนักเขียนเป็นของนักเขียน
            </h2>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-text-secondary">
              <li>ไม่คัดลอกงานคนอื่นมาโพสต์ ไม่แอบอ้างว่าเป็นของตัวเอง</li>
              <li>แนะนำเรื่องที่ชอบด้วยการแนบตอน ให้คนอ่านไปอ่านที่ต้นทาง</li>
              <li>เจอโพสต์ที่ละเมิดงานเขียน กดรายงานได้จากเมนู ⋯ บนโพสต์นั้น</li>
            </ul>
          </section>

          <section className="rounded-md border border-border bg-surface p-4 text-text-secondary">
            <p>
              โพสต์ที่ผิดกติกาจะถูกทีมงานซ่อนหรือนำออก และบัญชีที่ทำซ้ำอาจถูกจำกัดการใช้งาน
              หากพบโพสต์ที่มีปัญหา ใช้ปุ่มรายงานในเมนู ⋯ ของโพสต์นั้นได้เลย
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm">
          <Link href="/community" className="text-primary hover:underline">
            ← กลับสู่ชุมชน
          </Link>
        </p>
      </PageContainer>
    </main>
  );
}
