"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Cover } from "@/components/fiction/cover";
import { Icon } from "@/components/ui/icon";
import { count } from "@/lib/format";
import { bookmarkNovel, removeBookmark } from "@/lib/library-client";
import {
  addToShelf,
  createShelf,
  deleteShelf,
  removeFromShelf,
  updateShelf,
} from "@/lib/shelves-client";
import { PresentationFormat, presentationLabel } from "@/types/fiction";
import type { ContinueReadingEntry, LibraryEntry } from "@/types/library";
import type { Novel } from "@/types/novel";
import type { Shelf } from "@/types/shelf";

import {
  EmptyState,
  NovelFacts,
  NovelTitleLink,
  novelPath,
  statusLabel,
} from "@/features/library/shared";

/**
 * แท็บ "ชั้นของฉัน" (library redesign 2026-08, section D): shelves as a real
 * tool, not one bookmark list.
 *
 *   - Two views, remembered per device: the shelf grid (stacked covers, item
 *     count, public/private, copy link) and the all-fictions grid with the
 *     filters a reader actually decides by.
 *   - "บันทึกไว้อ่าน" is the system shelf backed by bookmarks - it cannot be
 *     deleted, exactly as the migration decided bookmarks and shelves stay
 *     separate things.
 *   - A fiction may sit on many shelves; moving happens through each card's
 *     ⋯ menu (keyboard-reachable by construction).
 *   - สุ่มจากชั้นของฉัน picks for the reader who cannot pick.
 */

const VIEW_KEY = "ft:library:shelf-view";

type ShelfView = "shelves" | "all";

interface AllItem {
  novel: Novel;
  addedAt: string;
  shelfIds: string[];
  bookmarked: boolean;
}

export function ShelvesTab({
  bookmarks,
  initialShelves,
  reading,
  username,
  notify,
}: {
  bookmarks: LibraryEntry[];
  initialShelves: Shelf[];
  reading: ContinueReadingEntry[];
  /** The signed-in reader's username, for public-shelf links. */
  username: string;
  notify: (message: string, undo?: () => void) => void;
}) {
  const router = useRouter();
  const [view, setView] = useState<ShelfView>("shelves");
  const [shelves, setShelves] = useState(initialShelves);
  const [saved, setSaved] = useState(bookmarks);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters (section D): the facts a reader decides by.
  const [formatFilter, setFormatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [freshFilter, setFreshFilter] = useState(false);
  const [order, setOrder] = useState("added");
  const [query, setQuery] = useState("");

  // The remembered view arrives AFTER hydration (matching server markup),
  // through a frame callback so the effect body itself sets no state.
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored !== "all" && stored !== "shelves") return;
    const frame = requestAnimationFrame(() => setView(stored));
    return () => cancelAnimationFrame(frame);
  }, []);

  function switchView(next: ShelfView) {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }

  const freshIDs = useMemo(
    () =>
      new Set(
        reading
          .filter((entry) => entry.new_since_read > 0 || entry.chapters_left > 0)
          .map((entry) => entry.novel.id),
      ),
    [reading],
  );

  /** Every saved fiction once: bookmarks and shelf items, deduped. */
  const allItems: AllItem[] = useMemo(() => {
    const byID = new Map<string, AllItem>();
    for (const entry of saved) {
      byID.set(entry.novel.id, {
        novel: entry.novel,
        addedAt: entry.bookmarked_at,
        shelfIds: [],
        bookmarked: true,
      });
    }
    for (const shelf of shelves) {
      for (const item of shelf.items) {
        const existing = byID.get(item.novel.id);
        if (existing) {
          existing.shelfIds.push(shelf.id);
          if (item.added_at > existing.addedAt) existing.addedAt = item.added_at;
        } else {
          byID.set(item.novel.id, {
            novel: item.novel,
            addedAt: item.added_at,
            shelfIds: [shelf.id],
            bookmarked: false,
          });
        }
      }
    }
    return [...byID.values()];
  }, [saved, shelves]);

  const filtered = useMemo(() => {
    let rows = allItems;
    if (query.trim() !== "") {
      const needle = query.trim().toLowerCase();
      rows = rows.filter((row) => row.novel.title.toLowerCase().includes(needle));
    }
    if (formatFilter !== "") {
      rows = rows.filter(
        (row) =>
          (row.novel.presentation_format ?? PresentationFormat.Standard) === formatFilter,
      );
    }
    if (statusFilter !== "") rows = rows.filter((row) => row.novel.status === statusFilter);
    if (freshFilter) rows = rows.filter((row) => freshIDs.has(row.novel.id));
    const sorted = [...rows];
    if (order === "added") sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    if (order === "updated")
      sorted.sort((a, b) => (b.novel.updated_at ?? "").localeCompare(a.novel.updated_at ?? ""));
    if (order === "title") sorted.sort((a, b) => a.novel.title.localeCompare(b.novel.title, "th"));
    if (order === "length") sorted.sort((a, b) => b.novel.chapter_count - a.novel.chapter_count);
    return sorted;
  }, [allItems, query, formatFilter, statusFilter, freshFilter, freshIDs, order]);

  async function compose(presetName?: string) {
    const shelfName = (presetName ?? name).trim();
    if (shelfName === "") return;
    try {
      const created = await createShelf({ name: shelfName, note: note.trim() || undefined });
      setShelves((current) => [...current, { ...created, items: created.items ?? [] }]);
      setName("");
      setNote("");
      setComposing(false);
      notify(`สร้างชั้น "${shelfName}" แล้ว`);
    } catch {
      notify("สร้างชั้นไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  function togglePublic(shelf: Shelf) {
    const next = !shelf.is_public;
    setShelves((current) =>
      current.map((row) => (row.id === shelf.id ? { ...row, is_public: next } : row)),
    );
    void updateShelf(shelf.id, { is_public: next });
    notify(next ? `ชั้น "${shelf.name}" เป็นสาธารณะแล้ว - โชว์บนโปรไฟล์ของคุณ` : `ชั้น "${shelf.name}" เป็นส่วนตัวแล้ว`);
  }

  function removeShelf(shelf: Shelf) {
    setShelves((current) => current.filter((row) => row.id !== shelf.id));
    void deleteShelf(shelf.id);
    notify(`ลบชั้น "${shelf.name}" แล้ว - เรื่องในชั้นไม่หายไปไหน`);
  }

  function copyLink(shelf: Shelf) {
    const url = `${window.location.origin}/users/${encodeURIComponent(username)}#shelves`;
    void navigator.clipboard?.writeText(url);
    notify(
      shelf.is_public
        ? "คัดลอกลิงก์แล้ว"
        : "คัดลอกลิงก์แล้ว - ชั้นยังเป็นส่วนตัว คนอื่นจะยังไม่เห็นจนกว่าจะตั้งเป็นสาธารณะ",
    );
  }

  function unbookmark(novel: Novel) {
    setSaved((current) => current.filter((row) => row.novel.id !== novel.id));
    void removeBookmark(novel.id);
    notify(`เอา "${novel.title}" ออกจากบันทึกไว้อ่านแล้ว`, () => {
      setSaved((current) => [{ novel, bookmarked_at: new Date().toISOString() }, ...current]);
      void bookmarkNovel(novel.id);
    });
  }

  function addSelectionToShelf(shelfID: string) {
    const shelf = shelves.find((row) => row.id === shelfID);
    if (!shelf) return;
    for (const novelID of selected) void addToShelf(shelfID, novelID);
    const picked = allItems.filter((row) => selected.has(row.novel.id));
    setShelves((current) =>
      current.map((row) =>
        row.id === shelfID
          ? {
              ...row,
              item_count: row.item_count + picked.length,
              items: [
                ...row.items,
                ...picked.map((item) => ({
                  novel: item.novel,
                  added_at: new Date().toISOString(),
                })),
              ],
            }
          : row,
      ),
    );
    setSelected(new Set());
    notify(`เพิ่ม ${count(picked.length)} เรื่องลงชั้น "${shelf.name}" แล้ว`);
  }

  function randomRead() {
    if (allItems.length === 0) return;
    const pick = allItems[Math.floor(Math.random() * allItems.length)];
    router.push(novelPath(pick.novel));
  }

  const empty = shelves.length === 0 && saved.length === 0;

  return (
    <div>
      {/* The tab's own toolbar: view switch, search, random. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          {(
            [
              ["shelves", "มุมมองชั้น"],
              ["all", "เรื่องทั้งหมด"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => switchView(key)}
              className={`min-h-8 px-3 ${
                view === key
                  ? "bg-primary-50 font-medium text-primary"
                  : "text-text-secondary hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === "all" ? (
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาในชั้น…"
            aria-label="ค้นหาในชั้น"
            className="min-h-8 w-44 rounded-md border border-border bg-surface px-3 text-xs outline-none focus:border-primary"
          />
        ) : null}
        <button
          type="button"
          onClick={randomRead}
          disabled={allItems.length === 0}
          className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-secondary hover:border-primary-200 hover:text-text disabled:opacity-50"
        >
          <Icon name="sparkle" size={12} />
          สุ่มจากชั้นของฉัน
        </button>
        {view === "shelves" && !composing ? (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="ms-auto inline-flex min-h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-white hover:opacity-90"
          >
            <Icon name="plus" size={13} />
            สร้างชั้น
          </button>
        ) : null}
      </div>

      {composing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void compose();
              if (event.key === "Escape") setComposing(false);
            }}
            placeholder="ชื่อชั้น เช่น ฟิคที่ทำให้ร้อง"
            aria-label="ชื่อชั้นใหม่"
            className="min-h-9 w-56 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="คำอธิบายสั้น ๆ (ไม่บังคับ)"
            aria-label="คำอธิบายชั้น"
            className="min-h-9 w-64 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void compose()}
            className="inline-flex min-h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:opacity-90"
          >
            สร้างชั้น
          </button>
          <button
            type="button"
            onClick={() => setComposing(false)}
            className="text-sm text-text-secondary hover:text-text"
          >
            ยกเลิก
          </button>
        </div>
      ) : null}

      {empty ? (
        <EmptyState
          icon="library"
          title="ยังไม่มีชั้นหนังสือ"
          body="ชั้นคือคอลเลกชันที่คุณจัดเอง - แยกฟิคตามอารมณ์ ตามแฟนด้อม หรือจะตั้งเป็นสาธารณะให้คนอื่นตามอ่านก็ได้"
        >
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {["อ่านซ้ำได้", "ค่อยมาอ่าน", "ฟิคที่ทำให้ร้อง"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => void compose(preset)}
                className="inline-flex min-h-8 items-center rounded-full border border-dashed border-border px-3 text-xs text-text-secondary hover:border-primary-200 hover:text-primary"
              >
                + {preset}
              </button>
            ))}
          </div>
        </EmptyState>
      ) : view === "shelves" ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* The system shelf first: bookmarks, undeletable. */}
          <ShelfCard
            title="บันทึกไว้อ่าน"
            note="ชั้นเริ่มต้นของทุกคน - ลบไม่ได้"
            covers={saved.slice(0, 3).map((row) => row.novel)}
            countLabel={`${count(saved.length)} เรื่อง`}
            onOpen={() => switchView("all")}
          />
          {shelves.map((shelf) => (
            <ShelfCard
              key={shelf.id}
              title={shelf.name}
              note={shelf.note ?? undefined}
              covers={shelf.items.slice(0, 3).map((item) => item.novel)}
              countLabel={`${count(shelf.item_count)} เรื่อง`}
              isPublic={shelf.is_public}
              onTogglePublic={() => togglePublic(shelf)}
              onCopyLink={() => copyLink(shelf)}
              onDelete={() => removeShelf(shelf)}
              onOpen={() => switchView("all")}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          {/* Filters: the four decision facts plus "มีตอนใหม่". */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={formatFilter}
              onChange={(event) => setFormatFilter(event.target.value)}
              aria-label="กรองตามรูปแบบ"
              className="min-h-8 rounded-md border border-border bg-surface px-2 outline-none focus:border-primary"
            >
              <option value="">ทุกรูปแบบ</option>
              {Object.values(PresentationFormat).map((format) => (
                <option key={format} value={format}>
                  {presentationLabel(format)}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="กรองตามสถานะเรื่อง"
              className="min-h-8 rounded-md border border-border bg-surface px-2 outline-none focus:border-primary"
            >
              <option value="">ทุกสถานะ</option>
              {(["ongoing", "completed", "hiatus"] as const).map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={freshFilter}
                onChange={(event) => setFreshFilter(event.target.checked)}
                className="size-3.5 accent-primary"
              />
              มีตอนที่ยังไม่ได้อ่าน
            </label>
            <select
              value={order}
              onChange={(event) => setOrder(event.target.value)}
              aria-label="เรียงตาม"
              className="ms-auto min-h-8 rounded-md border border-border bg-surface px-2 outline-none focus:border-primary"
            >
              <option value="added">เพิ่มเข้าชั้นล่าสุด</option>
              <option value="updated">อัปเดตล่าสุด</option>
              <option value="title">ชื่อเรื่อง</option>
              <option value="length">ความยาว</option>
            </select>
          </div>

          {selected.size > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs">
              <span className="font-medium text-primary">
                เลือกแล้ว {count(selected.size)} เรื่อง
              </span>
              <select
                defaultValue=""
                aria-label="เพิ่มที่เลือกลงชั้น"
                onChange={(event) => {
                  if (event.target.value !== "") addSelectionToShelf(event.target.value);
                }}
                className="min-h-7 rounded-md border border-border bg-surface px-2 outline-none focus:border-primary"
              >
                <option value="">เพิ่มลงชั้น…</option>
                {shelves.map((shelf) => (
                  <option key={shelf.id} value={shelf.id}>
                    {shelf.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ms-auto text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="mt-6 text-center text-sm text-text-secondary">
              ไม่มีเรื่องที่ตรงกับตัวกรอง
            </p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {filtered.map((item) => (
                <li key={item.novel.id}>
                  <AllItemRow
                    item={item}
                    shelves={shelves}
                    checked={selected.has(item.novel.id)}
                    onCheck={(next) =>
                      setSelected((current) => {
                        const set = new Set(current);
                        if (next) set.add(item.novel.id);
                        else set.delete(item.novel.id);
                        return set;
                      })
                    }
                    menuOpen={menuFor === item.novel.id}
                    onMenu={() =>
                      setMenuFor((current) =>
                        current === item.novel.id ? null : item.novel.id,
                      )
                    }
                    hasNew={freshIDs.has(item.novel.id)}
                    onAddToShelf={(shelf) => {
                      void addToShelf(shelf.id, item.novel.id);
                      setShelves((current) =>
                        current.map((row) =>
                          row.id === shelf.id
                            ? {
                                ...row,
                                item_count: row.item_count + 1,
                                items: [
                                  ...row.items,
                                  { novel: item.novel, added_at: new Date().toISOString() },
                                ],
                              }
                            : row,
                        ),
                      );
                      setMenuFor(null);
                      notify(`เพิ่มลงชั้น "${shelf.name}" แล้ว`);
                    }}
                    onRemoveFromShelf={(shelf) => {
                      void removeFromShelf(shelf.id, item.novel.id);
                      setShelves((current) =>
                        current.map((row) =>
                          row.id === shelf.id
                            ? {
                                ...row,
                                item_count: Math.max(0, row.item_count - 1),
                                items: row.items.filter(
                                  (entry) => entry.novel.id !== item.novel.id,
                                ),
                              }
                            : row,
                        ),
                      );
                      setMenuFor(null);
                      notify(`เอาออกจากชั้น "${shelf.name}" แล้ว`);
                    }}
                    onUnbookmark={() => {
                      setMenuFor(null);
                      unbookmark(item.novel);
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** One shelf in the grid: three stacked covers, the count, the controls. */
function ShelfCard({
  title,
  note,
  covers,
  countLabel,
  isPublic,
  onTogglePublic,
  onCopyLink,
  onDelete,
  onOpen,
}: {
  title: string;
  note?: string;
  covers: Novel[];
  countLabel: string;
  isPublic?: boolean;
  onTogglePublic?: () => void;
  onCopyLink?: () => void;
  onDelete?: () => void;
  onOpen: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="rounded-lg border border-border bg-surface p-3.5">
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 text-start">
        <span className="relative h-20 w-16 shrink-0">
          {covers.length === 0 ? (
            <span className="absolute inset-0 rounded-md border border-dashed border-border" />
          ) : (
            covers.map((novel, at) => (
              <span
                key={novel.id}
                className="absolute h-18 w-13 overflow-hidden rounded-md border border-background shadow-sm"
                style={{ left: at * 6, top: at * 4, zIndex: covers.length - at }}
              >
                <Cover url={novel.cover_url} title={novel.title} />
              </span>
            ))
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="line-clamp-1 font-medium">{title}</span>
            {isPublic ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Icon name="globe" size={9} />
                สาธารณะ
              </span>
            ) : null}
          </span>
          {note ? (
            <span className="mt-0.5 line-clamp-2 block text-xs text-text-secondary">{note}</span>
          ) : null}
          <span className="mt-1 block text-xs text-text-muted">{countLabel}</span>
        </span>
      </button>

      {onTogglePublic ? (
        <div className="mt-2.5 flex items-center gap-2 border-t border-hairline pt-2 text-xs">
          <button
            type="button"
            onClick={onTogglePublic}
            className="text-text-secondary hover:text-text"
          >
            {isPublic ? "ตั้งเป็นส่วนตัว" : "ตั้งเป็นสาธารณะ"}
          </button>
          <button
            type="button"
            onClick={onCopyLink}
            className="inline-flex items-center gap-1 text-text-secondary hover:text-text"
          >
            <Icon name="link" size={11} />
            คัดลอกลิงก์
          </button>
          {confirming ? (
            <span className="ms-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={onDelete}
                className="font-medium text-error hover:underline"
              >
                ยืนยันลบชั้น
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-text-secondary hover:text-text"
              >
                ยกเลิก
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="ms-auto text-text-muted hover:text-error"
            >
              ลบชั้น
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}

function AllItemRow({
  item,
  shelves,
  checked,
  onCheck,
  menuOpen,
  onMenu,
  hasNew,
  onAddToShelf,
  onRemoveFromShelf,
  onUnbookmark,
}: {
  item: AllItem;
  shelves: Shelf[];
  checked: boolean;
  onCheck: (next: boolean) => void;
  menuOpen: boolean;
  onMenu: () => void;
  hasNew: boolean;
  onAddToShelf: (shelf: Shelf) => void;
  onRemoveFromShelf: (shelf: Shelf) => void;
  onUnbookmark: () => void;
}) {
  const onShelves = shelves.filter((shelf) => item.shelfIds.includes(shelf.id));
  const offShelves = shelves.filter((shelf) => !item.shelfIds.includes(shelf.id));

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-surface p-2.5 ${
        checked ? "border-primary" : "border-border"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheck(event.target.checked)}
        aria-label={`เลือก ${item.novel.title}`}
        className="size-4 shrink-0 accent-primary"
      />
      <Link href={novelPath(item.novel)} className="w-10 shrink-0">
        <Cover url={item.novel.cover_url} title={item.novel.title} className="rounded" />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <NovelTitleLink novel={item.novel} />
          {hasNew ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary">
              มีตอนใหม่
            </span>
          ) : null}
        </div>
        <div className="mt-1">
          <NovelFacts novel={item.novel} />
        </div>
        {onShelves.length > 0 ? (
          <p className="mt-1 line-clamp-1 text-[11px] text-text-muted">
            อยู่ในชั้น: {onShelves.map((shelf) => shelf.name).join(" · ")}
          </p>
        ) : null}
      </div>
      <span className="relative shrink-0">
        <button
          type="button"
          onClick={onMenu}
          aria-label={`เมนูของ ${item.novel.title}`}
          aria-expanded={menuOpen}
          className="flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-secondary hover:text-text"
        >
          <Icon name="more-horizontal" size={16} />
        </button>
        {menuOpen ? (
          <span className="absolute top-full z-20 mt-1 flex w-56 flex-col rounded-md border border-border bg-surface p-1 text-[13px] shadow-lg inset-e-0">
            {offShelves.length > 0 ? (
              <>
                <span className="px-2.5 py-1 text-[11px] text-text-muted">เพิ่มลงชั้น…</span>
                {offShelves.map((shelf) => (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => onAddToShelf(shelf)}
                    className="rounded px-2.5 py-1.5 text-start hover:bg-surface-secondary"
                  >
                    {shelf.name}
                  </button>
                ))}
              </>
            ) : null}
            {onShelves.length > 0 ? (
              <>
                <span className="px-2.5 py-1 text-[11px] text-text-muted">เอาออกจากชั้น…</span>
                {onShelves.map((shelf) => (
                  <button
                    key={shelf.id}
                    type="button"
                    onClick={() => onRemoveFromShelf(shelf)}
                    className="rounded px-2.5 py-1.5 text-start hover:bg-surface-secondary"
                  >
                    {shelf.name}
                  </button>
                ))}
              </>
            ) : null}
            {item.bookmarked ? (
              <button
                type="button"
                onClick={onUnbookmark}
                className="mt-1 rounded border-t border-hairline px-2.5 py-1.5 pt-2 text-start text-error hover:bg-error/5"
              >
                เอาออกจากบันทึกไว้อ่าน
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    </div>
  );
}
