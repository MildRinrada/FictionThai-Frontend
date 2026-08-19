import { Icon } from "@/components/ui/icon";
import type { NovelRights } from "@/types/novel";

/**
 * The author's stated permissions, shown to readers
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13E).
 *
 * The honest answer to "ห้ามแคปจอ". A platform cannot prevent a screenshot, so
 * this card never says it does - it says what the author ALLOWS, and the line
 * at the bottom says out loud that it is a request rather than a lock. A
 * control that cannot be enforced is a declaration, and must say so
 * (docs/11 §43).
 *
 * A Server Component: it is inert text and ships no JavaScript.
 */

export interface RightsCardProps {
  rights: NovelRights;
  authorName: string;
}

export function RightsCard({ rights, authorName }: RightsCardProps) {
  const allowed: string[] = [];
  const asked: string[] = [];

  if (rights.allow_screenshot) allowed.push("แคปหน้าจอและแชร์บางส่วน");
  if (rights.allow_translation) allowed.push("แปลเป็นภาษาอื่น");
  if (rights.allow_audio) allowed.push("อ่านออกเสียงหรือทำคลิป");
  if (rights.allow_derivative) {
    allowed.push(
      rights.derivative_terms
        ? `ทำ fanart หรือฟิคต่อยอด (${rights.derivative_terms})`
        : "ทำ fanart หรือฟิคต่อยอด",
    );
  }
  if (rights.require_credit) asked.push("ให้เครดิตพร้อมลิงก์กลับมาที่ต้นทาง");

  // A card that lists nothing is a box of nothing. Silence here means the
  // author has not said anything, which is different from saying no.
  if (allowed.length === 0 && asked.length === 0) return null;

  return (
    <section
      aria-labelledby="rights-heading"
      className="rounded-lg border border-border bg-surface-secondary p-4"
    >
      <p id="rights-heading" className="mono-label flex items-center gap-1.5">
        <Icon name="flag" size={13} />
        {authorName} อนุญาตว่า
      </p>

      {allowed.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px] leading-relaxed">
          {allowed.map((item) => (
            <li key={item} className="flex gap-2">
              <Icon name="check" size={15} className="mt-0.5 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      {asked.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed">
          {asked.map((item) => (
            <li key={item} className="flex gap-2 text-text-secondary">
              <Icon name="heart" size={15} className="mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-text-muted">
        นี่คือความประสงค์ของผู้เขียน ไม่ใช่การล็อกทางเทคนิค -
        ระบบไม่ได้ป้องกันการแคปหรือคัดลอก และจะไม่บอกว่าป้องกันได้
      </p>
    </section>
  );
}
