import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/shell/page-container";
import { Icon } from "@/components/ui/icon";
import { env } from "@/lib/env";

/**
 * Contact the team.
 *
 * There is no contact endpoint in the API, so this page does NOT render a form
 * that pretends to submit one. It routes each kind of request to the channel
 * that actually handles it: content problems go through the in-app report flow
 * (which the moderation queue reads, docs/11 §38), and everything else goes to
 * the support address if the deployment has configured one.
 *
 * A "ส่งข้อความ" button posting into nothing would be the worst possible
 * outcome for someone reporting abuse.
 */

export const metadata: Metadata = {
  title: "ติดต่อทีมงาน",
  description: "ช่องทางติดต่อทีมงาน FictionThai สำหรับปัญหาการใช้งาน เนื้อหา และลิขสิทธิ์",
};

const TOPICS = [
  {
    title: "รายงานเนื้อหาที่ไม่เหมาะสม",
    body: "ใช้ปุ่ม “รายงาน” บนหน้าเรื่อง ตอน หรือโพสต์นั้นโดยตรง - รายงานจะเข้าคิวตรวจสอบพร้อมลิงก์ของเนื้อหา ทำให้ทีมงานตรวจได้เร็วกว่าการส่งอีเมล",
    action: { href: "/explore", label: "ไปหาเนื้อหาที่ต้องการรายงาน" },
  },
  {
    title: "ปัญหาการใช้งานหรือบัญชี",
    body: "เข้าไม่ได้ ยืนยันอีเมลไม่สำเร็จ หรือระบบทำงานผิดปกติ - บอกขั้นตอนที่ทำ หน้าจอที่พบปัญหา และเวลาที่เกิดขึ้น จะช่วยให้ตรวจสอบได้เร็วขึ้นมาก",
  },
  {
    title: "ลิขสิทธิ์และการนำงานไปใช้",
    body: "งานเขียนทั้งหมดเป็นลิขสิทธิ์ของผู้เขียน หากพบว่ามีการนำงานของคุณมาเผยแพร่โดยไม่ได้รับอนุญาต แจ้งลิงก์ของเรื่องหรือตอนนั้นมาพร้อมหลักฐานความเป็นเจ้าของ",
  },
  {
    title: "เสนอฟีเจอร์หรือให้ความเห็น",
    body: "บอกได้เลยว่าติดอะไรระหว่างเขียนหรืออ่าน ข้อเสนอที่มาพร้อมสถานการณ์จริงมีน้ำหนักกว่ารายการฟีเจอร์เสมอ",
  },
];

export default function ContactPage() {
  const email = env.supportEmail;

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
          <p className="mono-label">Contact</p>
          <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight sm:text-[29px]">
            ติดต่อทีมงาน
          </h1>
          <p className="mt-2.5 max-w-prose text-sm leading-relaxed text-text-secondary">
            เลือกเรื่องที่ตรงที่สุด แล้วใช้ช่องทางที่ระบุไว้
            เรื่องที่เกี่ยวกับเนื้อหาบนแพลตฟอร์มควรใช้ปุ่มรายงานในหน้านั้นเสมอ
            เพราะจะมีลิงก์และบริบทติดไปด้วย
          </p>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <ul className="flex flex-col gap-4">
            {TOPICS.map((topic) => (
              <li
                key={topic.title}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 className="font-serif text-lg font-semibold">{topic.title}</h2>
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-secondary">
                  {topic.body}
                </p>
                {topic.action ? (
                  <Link
                    href={topic.action.href}
                    className="mt-3.5 inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-text-secondary hover:border-primary-200 hover:text-text"
                  >
                    {topic.action.label}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-border bg-surface p-5">
              <p className="mono-label">ช่องทางอีเมล</p>
              {email ? (
                <>
                  <a
                    href={`mailto:${email}`}
                    className="mt-3 block break-all text-sm text-primary hover:underline"
                  >
                    {email}
                  </a>
                  <p className="mt-2.5 text-xs leading-relaxed text-text-muted">
                    แนบลิงก์ของหน้าที่เกี่ยวข้องและภาพหน้าจอมาด้วย
                    จะช่วยให้ตรวจสอบได้เร็วขึ้น
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                  ยังไม่ได้ตั้งค่าอีเมลติดต่อสำหรับการติดตั้งนี้
                  ระหว่างนี้ให้ใช้ปุ่มรายงานในหน้าเนื้อหาสำหรับเรื่องที่เกี่ยวกับเนื้อหา
                </p>
              )}
            </section>

            <section className="rounded-lg border border-border bg-surface p-5">
              <p className="mono-label">สิ่งที่ควรรู้</p>
              <ul className="mt-3 flex flex-col gap-2.5 text-xs leading-relaxed text-text-secondary">
                <li>ทีมงานไม่เข้าถึงหรือแก้ไขงานเขียนของคุณโดยไม่ได้รับอนุญาต</li>
                <li>รายงานเนื้อหาจะถูกตรวจโดยผู้ดูแล ไม่ใช่ระบบอัตโนมัติเพียงอย่างเดียว</li>
                <li>คำขอเรื่องบัญชีอาจต้องยืนยันตัวตนจากอีเมลที่ผูกกับบัญชีนั้น</li>
              </ul>
            </section>
          </aside>
        </div>
      </PageContainer>
    </main>
  );
}
