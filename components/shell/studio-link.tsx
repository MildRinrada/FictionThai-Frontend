import { NavLink } from "@/components/shell/nav-link";
import { Icon } from "@/components/ui/icon";

/**
 * ✎ สตูดิโอ - a top-level destination, not a line in the account menu.
 *
 * It is the page a writer opens most often on the whole platform, and it used
 * to be reachable only by clicking their own avatar - a place people look for
 * settings and sign-out, not for their work. Anything hidden there is, in
 * practice, not there.
 *
 * The pen marks it as the writer's side of the header. The left-hand links are
 * the reader's (สำรวจ · ชุมชน · ชั้นหนังสือ) and carry no icon, so the two
 * modes are told apart at a glance rather than by reading four words.
 *
 * **The badge is the point.** ร่างที่ค้าง - drafts with words in them that
 * nobody can read yet - is the number that brings a writer back to finish
 * something, and it does that without a single email. It counts only drafts
 * with content: an empty chapter is not a task, and a number that cannot be
 * cleared is a number that gets ignored.
 */
export function StudioLink({ unfinished }: { unfinished: number }) {
  const waiting = unfinished > 0;

  return (
    // An OUTLINE button, not bare text (navbar review): สร้างผลงาน beside it
    // is the bar's one solid button, and two weighted controls balance the
    // writer group where one heavy button at the far edge tipped it.
    <NavLink
      href="/studio"
      className="relative inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm whitespace-nowrap"
      // NO persistent active state (navbar review round 4): on a
      // button-shaped control a lasting fill reads as a press that never
      // released, whatever colour it is - two review rounds said so. The
      // studio pages themselves say where you are; aria-current still
      // carries it for assistive tech through NavLink.
      activeClassName="border-border text-text-secondary hover:border-primary-200 hover:text-text"
      inactiveClassName="border-border text-text-secondary hover:border-primary-200 hover:text-text"
    >
      <Icon name="edit" size={16} />
      สตูดิโอ
      {waiting ? (
        <span
          // The number is read out with its meaning, because "สตูดิโอ 3" on
          // its own is an address, not a message.
          aria-label={`ร่างที่ยังไม่เผยแพร่ ${unfinished} ตอน`}
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 font-mono text-[11px] leading-none font-medium text-white tabular-nums"
        >
          {unfinished > 99 ? "99+" : unfinished}
        </span>
      ) : null}
    </NavLink>
  );
}
