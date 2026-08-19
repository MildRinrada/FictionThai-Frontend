import Link from "next/link";

import {
  PlaceholderBlock,
  PlaceholderInline,
} from "@/components/policies/placeholder";
import { Icon } from "@/components/ui/icon";
import { PrintButton } from "@/features/policies/print-button";
import { policyNeighbours, type PolicyDoc } from "@/features/policies/catalog";

/**
 * One policy document, rendered from the catalog scaffold
 * (FictionThai Legal.dc.html; the no-content rule lives in the catalog).
 *
 * Structure a dispute can cite: numbered, self-linking sections (#01, #02),
 * the version and dates in the meta bar, and a print path that keeps exactly
 * this body. Real wording arrives by editing the catalog - the layout never
 * changes shape when it does.
 */

export function PolicyArticle({ doc }: { doc: PolicyDoc }) {
  const { prev, next } = policyNeighbours(doc.slug);

  return (
    <div className="min-w-0">
      {/* Meta bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline pb-3">
        <span className="inline-flex min-h-6 items-center rounded-sm border border-primary-200 bg-surface-secondary px-2 font-mono text-[10.5px] text-primary">
          ฉบับ {doc.version}
        </span>
        <span className="text-xs text-text-muted">
          มีผลเมื่อ <PlaceholderInline hint="วันที่มีผล" /> · แก้ไขล่าสุด{" "}
          <PlaceholderInline hint="วันที่แก้ไข" /> · อ่านประมาณ{" "}
          <PlaceholderInline hint="X นาที" />
        </span>
        <span className="ms-auto flex items-center gap-2 print:hidden">
          <button
            type="button"
            disabled
            title="จะใช้ได้เมื่อมีการแก้ไขฉบับครั้งแรก"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-text-muted"
          >
            <Icon name="clock" size={13} />
            ดูฉบับก่อนหน้า
          </button>
          <PrintButton />
        </span>
      </div>

      {/* Title */}
      <p className="mono-label mt-5">{doc.kicker}</p>
      <h1 className="mt-1.5 font-serif text-[27px] leading-[1.3] font-semibold tracking-tight text-pretty sm:text-[33px]">
        {doc.title}
      </h1>
      <div className="mt-3 max-w-prose">
        <PlaceholderBlock
          slot={{ kind: "paragraphs", hint: `ย่อหน้านำ - ${doc.leadHint}`, length: doc.leadLength }}
        />
      </div>

      {/* สรุปสั้น ๆ */}
      <section
        aria-labelledby="policy-tldr"
        className="mt-6 max-w-prose rounded-lg border border-primary-200 bg-surface-secondary p-4"
      >
        <p id="policy-tldr" className="mono-label mb-3 text-primary">
          สรุปสั้น ๆ ก่อนอ่านฉบับเต็ม
        </p>
        <ul className="flex flex-col gap-2">
          {doc.tldrHints.map((hint, index) => (
            <li key={hint} className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-2 size-1.5 shrink-0 rounded-full bg-primary-400"
              />
              <div className="min-w-0 flex-1">
                <PlaceholderBlock
                  slot={{ kind: "paragraphs", hint: `สรุปข้อ ${index + 1} - ${hint}`, length: "1 บรรทัด" }}
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-text-muted">
          สรุปนี้เขียนให้อ่านง่าย ไม่ใช่ข้อผูกพันทางกฎหมาย — หากขัดกับฉบับเต็มด้านล่าง
          ให้ยึดฉบับเต็มเป็นหลัก
        </p>
      </section>

      {/* Sections */}
      <div className="mt-8 max-w-prose">
        {doc.sections.map((section, index) => {
          const number = String(index + 1).padStart(2, "0");
          return (
            <section
              key={section.heading}
              id={number}
              aria-label={`${number} ${section.heading}`}
              className="mb-8 scroll-mt-24"
            >
              <h2 className="flex items-baseline gap-2.5 font-serif text-lg leading-relaxed font-semibold text-pretty">
                <a
                  href={`#${number}`}
                  className="shrink-0 font-mono text-xs font-normal text-text-muted hover:text-primary"
                  aria-label={`ลิงก์ไปข้อ ${number}`}
                >
                  {number}
                </a>
                <span>{section.heading}</span>
              </h2>
              <div className="mt-3 flex flex-col gap-2.5">
                {section.slots.map((slot, slotIndex) => (
                  <PlaceholderBlock key={slotIndex} slot={slot} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Contact */}
      <section
        id="contact"
        aria-labelledby="policy-contact"
        className="max-w-prose scroll-mt-24 rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="policy-contact" className="font-serif text-base font-semibold">
          ต้องการติดต่อเรื่องนี้
        </h2>
        <div className="mt-2.5">
          <PlaceholderBlock
            slot={{ kind: "paragraphs", hint: doc.contactLeadHint, length: "1–2 บรรทัด" }}
          />
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {doc.contacts.map((contact) => (
            <li
              key={contact.label}
              className="flex flex-wrap items-center gap-3 rounded-md border border-hairline bg-background px-3 py-2.5"
            >
              <Icon name={contact.icon} size={17} className="shrink-0 text-text-muted" />
              <span className="min-w-44 flex-1">
                <span className="block text-[13px] font-medium">{contact.label}</span>
                <span className="mt-0.5 block text-xs">
                  <PlaceholderInline hint={contact.valueHint} />
                </span>
              </span>
              <span className="shrink-0 text-[11.5px] text-text-muted">
                <PlaceholderInline hint={contact.slaHint} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Prev / next */}
      <nav
        aria-label="เอกสารก่อนหน้าและถัดไป"
        className="mt-6 grid max-w-prose grid-cols-1 gap-2.5 sm:grid-cols-2 print:hidden"
      >
        <Link
          href={`/policies/${prev.slug}`}
          className="block rounded-lg border border-border bg-surface p-3.5 hover:border-primary-200 hover:bg-surface-secondary"
        >
          <span className="mono-label block text-[9px]">ก่อนหน้า</span>
          <span className="mt-1 block text-sm font-medium">{prev.title}</span>
        </Link>
        <Link
          href={`/policies/${next.slug}`}
          className="block rounded-lg border border-border bg-surface p-3.5 text-end hover:border-primary-200 hover:bg-surface-secondary"
        >
          <span className="mono-label block text-[9px]">ถัดไป</span>
          <span className="mt-1 block text-sm font-medium">{next.title}</span>
        </Link>
      </nav>

      <p className="mt-5 max-w-prose text-xs leading-relaxed text-text-muted">
        เอกสารทุกฉบับในหน้านี้เขียนเป็นภาษาไทยและใช้ฉบับภาษาไทยเป็นฉบับหลัก ·
        เมื่อมีการแก้ไขที่กระทบสิทธิของผู้ใช้อย่างมีนัยสำคัญ
        ระบบจะแจ้งบนหน้าเว็บล่วงหน้าและขอให้ยอมรับอีกครั้งก่อนวันที่มีผล
      </p>
    </div>
  );
}
