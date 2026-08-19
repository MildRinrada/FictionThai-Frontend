import { NovelRow } from "@/components/fiction/novel-card";
import { count } from "@/lib/format";
import type { Shelf } from "@/types/shelf";

/**
 * "ที่ฉันอ่าน" - the public bookshelves on someone's profile.
 *
 * A Server Component with no state and no fetching: shelves are the same for
 * every visitor, so they arrive with the page and ship no JavaScript
 * (docs/07 §20). Everything it renders has already been filtered by the API -
 * only shelves their owner published, holding only fictions a stranger may
 * open.
 *
 * Each fiction is a `NovelRow` from the existing card family, not a new card.
 * A shelf is a list of things to recognise rather than a grid to browse, which
 * is exactly what the compact row is for - and reusing it is what keeps a
 * one-shot looking like a one-shot everywhere (components/fiction/novel-card).
 *
 * What is NOT here: the reader's bookmarks. They are private, they are a
 * different table, and no page renders them to anyone but their owner.
 */

export interface ShelfListProps {
  shelves: Shelf[];
  /** The person's name, for the empty state's wording. */
  ownerName: string;
  /**
   * The viewer is the owner. Only changes the empty state - a stranger is told
   * there is nothing here, the owner is told how to start.
   */
  isOwner?: boolean;
}

export function ShelfList({ shelves, ownerName, isOwner = false }: ShelfListProps) {
  if (shelves.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-secondary">
        {isOwner
          ? "ยังไม่มีชั้นหนังสือที่เปิดให้คนอื่นดู - สร้างชั้นแล้วเลือกเปิดได้ที่หน้าตั้งค่าโปรไฟล์"
          : `${ownerName} ยังไม่ได้เปิดชั้นหนังสือให้คนอื่นดู`}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {shelves.map((shelf) => (
        <ShelfPanel key={shelf.id} shelf={shelf} />
      ))}
    </div>
  );
}

function ShelfPanel({ shelf }: { shelf: Shelf }) {
  return (
    <section
      aria-labelledby={`shelf-${shelf.id}`}
      className="rounded-xl border border-border bg-surface p-5"
    >
      <header className="mb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 id={`shelf-${shelf.id}`} className="font-serif text-lg font-semibold">
            {shelf.name}
          </h3>
          <span className="font-mono text-xs text-text-muted tabular-nums">
            {count(shelf.item_count)} เรื่อง
          </span>
        </div>
        {shelf.note ? (
          <p className="mt-1 text-sm text-text-secondary">{shelf.note}</p>
        ) : null}
      </header>

      {shelf.items.length === 0 ? (
        <p className="text-sm text-text-muted">ยังไม่มีเรื่องในชั้นนี้</p>
      ) : (
        <ul className="-mx-2">
          {shelf.items.map((item) => (
            <li key={item.novel.id}>
              <NovelRow novel={item.novel} />
              {item.note ? (
                <p className="mb-1 ps-16 pe-2 text-xs text-text-secondary">
                  {item.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {shelf.item_count > shelf.items.length ? (
        <p className="mt-3 text-xs text-text-muted">
          และอีก {count(shelf.item_count - shelf.items.length)} เรื่อง
        </p>
      ) : null}
    </section>
  );
}
