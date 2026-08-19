import Link from "next/link";

import {
  POLICY_DOCS,
  POLICY_GROUPS,
  type PolicyDoc,
} from "@/features/policies/catalog";

/**
 * The policy center's table of contents (FictionThai Legal.dc.html).
 *
 * Plain links to real URLs - every document has an address a dispute can
 * cite. Sticky column from lg up; on small screens the page renders it inside
 * a <details> instead (no JavaScript either way).
 *
 * The provider card is the one piece of real wording chrome carries: the
 * site is run by one person, and every policy page must set that expectation
 * before the reader starts counting on a support team.
 */

export function PolicyTocList({ current }: { current: PolicyDoc }) {
  return (
    <nav aria-label="สารบัญเอกสาร" className="flex flex-col gap-3.5">
      {POLICY_GROUPS.map((group) => (
        <div key={group}>
          <p className="mono-label mb-1.5 text-[9px]">{group}</p>
          <ul className="flex flex-col gap-0.5">
            {POLICY_DOCS.filter((doc) => doc.group === group).map((doc) => {
              const selected = doc.slug === current.slug;
              return (
                <li key={doc.slug}>
                  <Link
                    href={`/policies/${doc.slug}`}
                    aria-current={selected ? "page" : undefined}
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${
                      selected ? "bg-surface-secondary" : "hover:bg-surface-secondary"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`w-0.5 shrink-0 self-stretch rounded-full ${
                        selected ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[13px] leading-snug ${
                          selected ? "font-semibold text-primary" : "text-text"
                        }`}
                      >
                        {doc.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[9.5px] text-text-muted">
                        {doc.version} · {doc.sections.length} หัวข้อ
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function ProviderCard() {
  return (
    <div className="rounded-lg border border-border bg-surface-secondary p-3.5">
      <p className="mono-label mb-1.5 text-[9px]">ผู้ให้บริการ</p>
      <p className="text-xs leading-relaxed">
        FictionThai ดำเนินการโดย{" "}
        <strong className="font-semibold">บุคคลธรรมดารายเดียว</strong>{" "}
        ไม่ใช่บริษัทหรือนิติบุคคล และไม่มีทีมงานหรือฝ่ายบริการลูกค้า
      </p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">
        การติดต่อทุกช่องทางจึงถึงคนคนเดียว ซึ่งตอบตามลำดับที่ได้รับและอาจใช้เวลา
      </p>
    </div>
  );
}
