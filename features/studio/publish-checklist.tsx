import Link from "next/link";

import { Icon } from "@/components/ui/icon";
import { PublishNovelButton } from "@/features/studio/publish-novel-button";
import type { NovelStatus, Readiness } from "@/types/novel";

/**
 * ก่อนเผยแพร่ - the second gate
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13L, reworked in §13T).
 *
 * 13A was right to cut the create form to six fields, but it left the synopsis,
 * the genres, and the tags with no point at which they were ever required
 * again: a lighter form that produced worse data. This is where they come back
 * - not before the first sentence, but in front of publishing.
 *
 * The count lives in ONE place: beside the publish button, as "อีก N ข้อ
 * จะเผยแพร่ได้". The header once carried a "2/4" of its own, which said the
 * same thing a second time and had to be reconciled with the list below it -
 * the rows themselves already show what is done and what is not.
 *
 * The box is NEUTRAL until it is done, then success. It used the warning tone,
 * which made an ordinary to-do list look like the ตัวแปรที่ยังไม่ประกาศ alert
 * beside it - yellow is for something being wrong, and nothing is wrong with
 * a story that is not published yet.
 *
 * The API refuses the publish independently (docs/11 §43); this panel is the
 * explanation, never the enforcement.
 */

/** Where each item is answered. Keyed by the API's stable item keys. */
const ITEM_LINKS: Record<string, { href: (base: string) => string; label: string }> = {
  description: { href: (base) => `${base}/settings`, label: "ไปเขียนเรื่องย่อ" },
  genres: { href: (base) => `${base}/settings`, label: "ไปเลือกหมวดหมู่" },
  tags: { href: (base) => `${base}/settings`, label: "ไปใส่แท็ก" },
  content_warning: { href: (base) => `${base}/settings`, label: "ไปเขียนคำเตือน" },
  cover: { href: (base) => `${base}/settings`, label: "ไปอัปโหลดปก" },
  // Account-level items live on the account settings page, not on the profile:
  // a profile is the page other people read
  // (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
  email_verified: { href: () => "/settings/profile", label: "ไปยืนยันอีเมล" },
  adult_attested: { href: () => "/settings/profile", label: "ไปยืนยันอายุ" },
};

export function PublishChecklist({
  readiness,
  novelRef,
  slug,
  status,
  undeclaredVariables = 0,
}: {
  readiness: Readiness;
  novelRef: string;
  /** The public slug, for the friends-first link. */
  slug: string;
  status: NovelStatus;
  /**
   * How many token-shaped strings the fiction's text uses without a
   * declaration, from the same variable report the overview's alert renders.
   * Advisory, like the cover: a reader meeting a raw "(y/n)" is worse than a
   * missing tag, but the scan is a heuristic, so it must never block a publish.
   */
  undeclaredVariables?: number;
}) {
  const base = `/studio/novels/${encodeURIComponent(novelRef)}`;
  const required = readiness.items.filter((item) => item.required);
  const suggested = readiness.items.filter((item) => !item.required);
  const remaining = required.filter((item) => !item.done).length;
  const hasAdvice = suggested.length > 0 || undeclaredVariables > 0;

  return (
    <section
      aria-labelledby="checklist-heading"
      className={`rounded-lg border p-4 ${
        readiness.ready ? "border-success/30 bg-success/5" : "border-border bg-surface"
      }`}
    >
      <p id="checklist-heading" className="mono-label flex items-center gap-1.5">
        <Icon name={readiness.ready ? "check" : "list"} size={14} />
        ก่อนเผยแพร่
      </p>

      {readiness.ready ? (
        <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
          ครบแล้ว - กดปุ่มด้านล่างได้เลย
        </p>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2">
        {required.map((item) => (
          <ChecklistRow key={item.key} item={item} base={base} />
        ))}
      </ul>

      {hasAdvice ? (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="mono-label text-text-muted">แนะนำเพิ่มเติม · ไม่บังคับ</p>
          <ul className="mt-2 flex flex-col gap-2">
            {suggested.map((item) => (
              <ChecklistRow key={item.key} item={item} base={base} />
            ))}
            {/* ตัวแปรที่ยังไม่ประกาศ, as a row on the list a writer actually
                works through before publishing. The full alert - which tokens,
                which chapters, the one-press declare - is the box this links
                to; the row exists so the list is complete, not to repeat it. */}
            {undeclaredVariables > 0 ? (
              <li className="flex gap-2 text-[13px]">
                <Icon
                  name="close"
                  size={15}
                  className="mt-0.5 shrink-0 text-text-muted"
                />
                <span>
                  ประกาศตัวแปรที่ใช้ในตอน ({undeclaredVariables} ตัว)
                  <span className="block text-xs text-text-muted">
                    ถ้าไม่ประกาศ ผู้อ่านจะเห็นโค้ดดิบแทนที่จะถูกถาม
                  </span>
                </span>
                <a
                  href="#undeclared-variables"
                  className="ms-auto shrink-0 self-start text-xs text-primary hover:underline"
                >
                  ดูรายละเอียด
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <PublishNovelButton
        novelRef={novelRef}
        slug={slug}
        status={status}
        ready={readiness.ready}
        remaining={remaining}
      />
    </section>
  );
}

function ChecklistRow({
  item,
  base,
}: {
  item: Readiness["items"][number];
  base: string;
}) {
  const link = ITEM_LINKS[item.key];
  return (
    <li className="flex gap-2 text-[13px]">
      <Icon
        name={item.done ? "check" : "close"}
        size={15}
        className={`mt-0.5 shrink-0 ${item.done ? "text-success" : "text-text-muted"}`}
      />
      <span className={item.done ? "text-text-muted line-through" : ""}>
        {item.label}
        {!item.done && item.hint ? (
          <span className="block text-xs text-text-muted">{item.hint}</span>
        ) : null}
      </span>

      {!item.done && link ? (
        <Link
          href={link.href(base)}
          className="ms-auto shrink-0 self-start text-xs text-primary hover:underline"
        >
          {link.label}
        </Link>
      ) : null}
    </li>
  );
}
