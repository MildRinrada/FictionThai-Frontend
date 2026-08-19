import type { ReactNode } from "react";

import type { PenNameView } from "@/types/profile";

/**
 * นามปากกา as a visitor sees them
 * (docs/PROFILE-AND-ACHIEVEMENTS.md Part 2).
 *
 * Read-only by construction: there is no control on this list, because a person
 * looking at someone else's profile has nothing to do with their names except
 * read them. The owner's editor is a separate component behind
 * `/settings/profile`.
 *
 * A server component - it renders response data and holds no state - so a
 * profile page still costs the visitor no JavaScript for this section.
 *
 * The «เคยใช้ชื่อ …» line is the reason the section is worth having at all. A
 * pen name is changeable and a handle is not, and impersonation in fic
 * communities usually starts with a name change; the platform's answer is not
 * to freeze names but to make a recent change VISIBLE. Thirty days, decided by
 * the API - long enough to notice, short enough not to follow someone forever.
 */

export function PenNameList({
  penNames,
  formerNames = [],
  fallback,
}: {
  penNames: PenNameView[];
  /** Names used in the last 30 days and no longer used. */
  formerNames?: string[];
  /** Shown when this writer has set no pen names at all. */
  fallback?: ReactNode;
}) {
  // The former-name line survives an empty list on purpose: a writer who
  // renamed and then removed the identity is exactly the case the line exists
  // for, and hiding it there would defeat the whole point.
  if (penNames.length === 0 && formerNames.length === 0) {
    return <>{fallback ?? null}</>;
  }

  return (
    <section aria-labelledby="pen-names-heading">
      <h2 id="pen-names-heading" className="sr-only">
        นามปากกา
      </h2>

      {penNames.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {penNames.map((penName) => (
            <li
              key={penName.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span className="font-serif text-base font-semibold">{penName.name}</span>
              {penName.is_default ? (
                <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs text-primary">
                  ค่าเริ่มต้น
                </span>
              ) : null}
              {penName.note ? (
                <span className="text-sm text-text-muted">{penName.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        fallback ?? null
      )}

      {formerNames.length > 0 ? (
        <p
          className={`text-sm text-text-muted ${penNames.length > 0 ? "mt-4" : "mt-0"}`}
        >
          เคยใช้ชื่อ {formerNames.join(" · ")}
          <span className="mt-1 block text-xs">
            แสดงชื่อที่เพิ่งเปลี่ยนไว้ 30 วัน เพื่อให้ผู้อ่านตามเจ้าของผลงานเดิมได้
          </span>
        </p>
      ) : null}
    </section>
  );
}
