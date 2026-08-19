"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  createShelf,
  deleteShelf,
  getMyShelves,
  removeFromShelf,
  updateShelf,
} from "@/lib/shelves-client";
import { SHELF_MAX, SHELF_NAME_MAX, SHELF_NOTE_MAX, type Shelf } from "@/types/shelf";

/**
 * The owner's bookshelf manager.
 *
 * This is the ONLY place a shelf becomes public, and the switch is per shelf on
 * purpose: README says bookmarks are private and that public collections are
 * optional, so there is no global "publish my reading" anywhere in this
 * product - and there is no control here that touches a bookmark at all.
 *
 * The wording under the switch is the important part of the component. A person
 * deciding whether to publish what they read needs to be told plainly what each
 * position means, in their own language, before they flip it - not after.
 */

export interface ShelfManagerProps {
  /** Pre-loaded shelves. Omit to fetch after mount. */
  initialShelves?: Shelf[];
}

export function ShelfManager({ initialShelves }: ShelfManagerProps) {
  const [shelves, setShelves] = useState<Shelf[]>(initialShelves ?? []);
  const [loading, setLoading] = useState(initialShelves === undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (initialShelves !== undefined) return;
    let cancelled = false;
    getMyShelves()
      .then((items) => {
        if (!cancelled) setShelves(items);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialShelves]);

  const replace = useCallback((shelf: Shelf) => {
    setShelves((current) => current.map((s) => (s.id === shelf.id ? shelf : s)));
  }, []);

  const drop = useCallback((id: string) => {
    setShelves((current) => current.filter((s) => s.id !== id));
  }, []);

  return (
    <section aria-labelledby="shelf-manager-heading" className="flex flex-col gap-5">
      <div>
        <h2 id="shelf-manager-heading" className="font-serif text-lg font-semibold">
          ชั้นหนังสือ
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          ชั้นหนังสือคือรายการที่คุณจัดเอง แยกจาก &ldquo;บันทึกไว้&rdquo;
          ที่เป็นของส่วนตัวเสมอ - การเปิดชั้นไม่ได้เปิดรายการที่บันทึกไว้
        </p>
      </div>

      {shelves.length < SHELF_MAX ? (
        <ShelfComposer
          onCreated={(shelf) => setShelves((current) => [...current, shelf])}
        />
      ) : (
        <p className="text-sm text-text-muted">
          สร้างชั้นหนังสือได้ไม่เกิน {SHELF_MAX} ชั้น
        </p>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">กำลังโหลดชั้นหนังสือ…</p>
      ) : failed ? (
        <p role="alert" className="text-sm text-text-secondary">
          โหลดชั้นหนังสือไม่สำเร็จ ลองใหม่อีกครั้ง
        </p>
      ) : shelves.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          ยังไม่มีชั้นหนังสือ - สร้างชั้นแรกได้เลย เช่น &ldquo;อ่านซ้ำได้ไม่เบื่อ&rdquo;
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {shelves.map((shelf) => (
            <li key={shelf.id}>
              <ShelfCard shelf={shelf} onChanged={replace} onDeleted={drop} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The create form. A new shelf is PRIVATE; opening it is a separate act. */
function ShelfComposer({ onCreated }: { onCreated: (shelf: Shelf) => void }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const shelf = await createShelf({ name: trimmed, note: note.trim() });
      setName("");
      setNote("");
      onCreated(shelf);
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? (cause.fields?.name?.[0] ?? cause.fields?.note?.[0] ?? cause.message)
          : "สร้างชั้นหนังสือไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, name, note, onCreated]);

  return (
    <form
      className="rounded-xl border border-border bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="block">
        <span className="mono-label">ชื่อชั้นใหม่</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={SHELF_NAME_MAX}
          placeholder="เช่น อ่านซ้ำได้ไม่เบื่อ"
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block">
        <span className="mono-label">คำอธิบายสั้น ๆ (ไม่ใส่ก็ได้)</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={SHELF_NOTE_MAX}
          placeholder="บอกคนอ่านว่าชั้นนี้รวมอะไรไว้"
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}
      <div className="mt-3">
        <Button type="submit" loading={busy} disabled={name.trim() === ""}>
          สร้างชั้นหนังสือ
        </Button>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        ชั้นที่สร้างใหม่จะเป็นชั้นส่วนตัวก่อนเสมอ เปิดให้คนอื่นดูได้ทีหลัง
      </p>
    </form>
  );
}

/** One shelf: its name, its switch, and the fictions on it. */
function ShelfCard({
  shelf,
  onChanged,
  onDeleted,
}: {
  shelf: Shelf;
  onChanged: (shelf: Shelf) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await updateShelf(shelf.id, { is_public: !shelf.is_public }));
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "เปลี่ยนการมองเห็นไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  }, [onChanged, shelf.id, shelf.is_public]);

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteShelf(shelf.id);
      onDeleted(shelf.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "ลบชั้นหนังสือไม่สำเร็จ");
      setBusy(false);
    }
  }, [onDeleted, shelf.id]);

  const unshelve = useCallback(
    async (novelId: string) => {
      setBusy(true);
      setError(null);
      try {
        await removeFromShelf(shelf.id, novelId);
        onChanged({
          ...shelf,
          items: shelf.items.filter((item) => item.novel.id !== novelId),
          item_count: Math.max(0, shelf.item_count - 1),
        });
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : "เอาออกจากชั้นไม่สำเร็จ");
      } finally {
        setBusy(false);
      }
    },
    [onChanged, shelf],
  );

  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-base font-semibold">{shelf.name}</h3>
          {shelf.note ? (
            <p className="mt-0.5 text-sm text-text-secondary">{shelf.note}</p>
          ) : null}
        </div>
        <span className="font-mono text-xs text-text-muted tabular-nums">
          {shelf.item_count} เรื่อง
        </span>
      </header>

      <div className="mt-4 rounded-lg border border-border bg-surface-secondary p-3">
        <button
          type="button"
          role="switch"
          aria-checked={shelf.is_public}
          aria-label={`เปิดชั้น ${shelf.name} ให้คนอื่นดู`}
          onClick={() => void toggle()}
          disabled={busy}
          className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm disabled:opacity-50 ${
            shelf.is_public
              ? "border-secondary-300 bg-secondary-50 text-secondary-600"
              : "border-border text-text-secondary hover:border-primary-200"
          }`}
        >
          {shelf.is_public ? "เปิดให้คนอื่นดู" : "ชั้นส่วนตัว"}
        </button>
        <p className="mt-2 text-xs text-text-secondary">
          {shelf.is_public
            ? "ตอนนี้ทุกคนที่เปิดหน้าโปรไฟล์ของคุณเห็นชั้นนี้ได้ (เห็นเฉพาะเรื่องที่เปิดสาธารณะอยู่แล้วเท่านั้น)"
            : "ตอนนี้ไม่มีใครเห็นชั้นนี้นอกจากคุณ - ทั้งชื่อชั้นและเรื่องข้างในไม่ปรากฏที่ไหนเลย"}
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {shelf.items.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {shelf.items.map((item) => (
            <li
              key={item.novel.id}
              className="flex items-center justify-between gap-3 border-t border-hairline pt-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{item.novel.title}</span>
              <button
                type="button"
                onClick={() => void unshelve(item.novel.id)}
                disabled={busy}
                className="shrink-0 text-xs text-text-secondary hover:text-error disabled:opacity-50"
              >
                เอาออกจากชั้น
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          ยังไม่มีเรื่องในชั้นนี้ - เพิ่มได้จากหน้าเรื่องที่อยากเก็บไว้
        </p>
      )}

      <footer className="mt-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-text-secondary">
              ลบเฉพาะชั้นนี้ ไม่ได้ลบเรื่องหรือรายการที่บันทึกไว้
            </p>
            <Button variant="destructive" onClick={() => void remove()} loading={busy}>
              ลบชั้นนี้
            </Button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-sm text-text-secondary hover:text-text"
            >
              ยกเลิก
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-sm text-text-secondary hover:text-error"
          >
            ลบชั้นหนังสือ
          </button>
        )}
      </footer>
    </article>
  );
}
