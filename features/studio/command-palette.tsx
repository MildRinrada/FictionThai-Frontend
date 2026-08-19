"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { searchNovel } from "@/lib/ai-client";
import type { AiSearchHit } from "@/types/ai";

/**
 * The studio's search palette (13Y §8): Ctrl+K anywhere in this fiction's
 * studio → type → jump to the chapter that says it. Literal search over
 * prose, chat lines, and headcanon entries - DRAFTS INCLUDED, which is why a
 * writer reaches for it. Results name the chapter, quote the surrounding
 * text, and one press opens the editor there.
 */

const SEARCH_DEBOUNCE_MS = 300;

const WHERE_LABEL: Record<string, string> = {
  prose: "เนื้อเรื่อง",
  chat: "แชท",
  entry: "เฮดแคนอน",
  title: "ชื่อตอน",
};

export function CommandPalette({ novelRef }: { novelRef: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AiSearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const timer = useRef<number | null>(null);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K opens; Escape closes. One listener for the whole studio.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the box when the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced search as the query changes. All state moves happen inside the
  // timeout - the effect body itself never calls setState (React Compiler).
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (timer.current !== null) window.clearTimeout(timer.current);
    const run = ++seq.current;
    timer.current = window.setTimeout(() => {
      if (seq.current !== run) return;
      if (trimmed === "") {
        setHits(null);
        setBusy(false);
        return;
      }
      setBusy(true);
      searchNovel(novelRef, trimmed)
        .then((results) => {
          if (seq.current !== run) return;
          setHits(results);
          setSelected(0);
        })
        .catch(() => {
          if (seq.current === run) setHits([]);
        })
        .finally(() => {
          if (seq.current === run) setBusy(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [query, open, novelRef]);

  function jump(hit: AiSearchHit) {
    setOpen(false);
    setQuery("");
    setHits(null);
    router.push(
      `/studio/novels/${encodeURIComponent(novelRef)}/chapters/${encodeURIComponent(hit.slug)}`,
    );
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="ค้นหาในเรื่อง"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-hairline px-3">
          <Icon name="search" size={16} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((i) => Math.min((hits?.length ?? 1) - 1, i + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((i) => Math.max(0, i - 1));
              }
              if (event.key === "Enter" && hits && hits[selected]) {
                event.preventDefault();
                jump(hits[selected]);
              }
            }}
            placeholder="ค้นหาฉากหรือข้อความในเรื่องนี้ - รวมฉบับร่าง"
            aria-label="คำค้น"
            className="min-h-12 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {busy ? (
            <p className="px-2 py-3 text-sm text-text-secondary">กำลังค้นหา…</p>
          ) : hits === null ? (
            <p className="px-2 py-3 text-xs text-text-muted">
              พิมพ์คำที่จำได้ เช่น ชื่อของ ฉาก หรือประโยค - ผลลัพธ์พาไปที่ตอนนั้นทันที
            </p>
          ) : hits.length === 0 ? (
            <p className="px-2 py-3 text-sm text-text-secondary">
              ไม่พบ «{query.trim()}» ในเรื่องนี้
            </p>
          ) : (
            <ul className="flex flex-col">
              {hits.map((hit, index) => (
                <li key={`${hit.chapter_id}-${hit.where}-${index}`}>
                  <button
                    type="button"
                    onClick={() => jump(hit)}
                    className={`w-full rounded-md px-2.5 py-2 text-start text-sm ${
                      index === selected ? "bg-primary-50" : "hover:bg-surface-secondary"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-xs text-text-secondary">
                      <span className="font-medium text-text">
                        ตอนที่ {hit.chapter_number}
                        {hit.title ? ` · ${hit.title}` : ""}
                      </span>
                      <span>{WHERE_LABEL[hit.where] ?? hit.where}</span>
                      {hit.status !== "published" ? (
                        <span className="rounded-full bg-surface-secondary px-1.5 py-0.5 text-[10px]">
                          ร่าง
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-text-secondary">
                      {hit.snippet}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
