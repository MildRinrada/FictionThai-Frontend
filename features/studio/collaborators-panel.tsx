"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { ApiError, getOne } from "@/lib/api";
import { addCollaborator, removeCollaborator } from "@/lib/novels-client";
import type { AuthorHit } from "@/lib/suggest-client";
import type { CollaboratorCredit } from "@/types/novel";

/**
 * ผู้เขียนร่วม (13U).
 *
 * The owner adds co-writers by username. A collaborator can open this
 * fiction's studio, write and edit its chapters, characters, and variables -
 * everything that IS co-writing. What they cannot touch: settings,
 * visibility, publishing, deletion, and this very list. Their name appears on
 * the fiction page as "ร่วมกับ …" with the credit wording chosen here.
 *
 * Removal is not destruction: everything the person wrote stays exactly where
 * it is. The panel says so, because a writer deciding whether to remove
 * someone deserves to know what the button does and does not do.
 */
export function CollaboratorsPanel({
  novelRef,
  initial,
  ownerUsername,
}: {
  novelRef: string;
  initial: CollaboratorCredit[];
  /** The fiction's owner - never a valid collaborator, so their own name is
      kept out of the suggestions and refused before the request is made. */
  ownerUsername?: string;
}) {
  const router = useRouter();
  const [collaborators, setCollaborators] = useState<CollaboratorCredit[]>(initial);
  const [username, setUsername] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live matches for the username being typed (collaborators review 2026-08):
  // an input that answers nothing while you type reads as "the system has no
  // one", when the truth is usually one letter of spelling. The same public
  // author search the navbar uses, presented the same way too - a floating
  // dropdown with the person's avatar and both names, so choosing a
  // collaborator looks like choosing a PERSON. Floating, not in-flow: an
  // inline row grew the left column and dropped the credit field beside it.
  const [matches, setMatches] = useState<AuthorHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!searchBox.current?.contains(event.target as Node)) setListOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [listOpen]);

  useEffect(() => {
    const q = username.trim();
    if (q.length < 2) {
      const clear = window.setTimeout(() => {
        setMatches([]);
        setSearched(false);
      }, 0);
      return () => window.clearTimeout(clear);
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      getOne<AuthorHit[]>("/search/authors", { query: { q }, signal: controller.signal })
        .then((hits) => {
          if (controller.signal.aborted) return;
          setMatches(
            hits.filter(
              (hit) =>
                !collaborators.some((c) => c.username === hit.username) &&
                hit.username.toLowerCase() !== (ownerUsername ?? "").toLowerCase(),
            ),
          );
          setSearched(true);
        })
        .catch(() => {
          // A failed lookup is a quieter input, never an error banner.
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [username, collaborators, ownerUsername]);

  const exact = matches.find(
    (hit) => hit.username.toLowerCase() === username.trim().toLowerCase(),
  );

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = username.trim();
    if (!name) return;

    // The two answers the API would refuse anyway, given BEFORE the round
    // trip (collaborators review round 2): the owner's own name, and a name
    // already on the list - the second the API accepts idempotently, which
    // reads as "nothing happened".
    if (ownerUsername && name.toLowerCase() === ownerUsername.toLowerCase()) {
      setError(
        "นี่คือชื่อของคุณเอง - เจ้าของเรื่องมีสิทธิ์ทุกอย่างอยู่แล้ว ไม่ต้องเพิ่มเป็นผู้เขียนร่วม",
      );
      return;
    }
    const already = collaborators.find(
      (person) => person.username.toLowerCase() === name.toLowerCase(),
    );
    if (already) {
      setError(`@${already.username} เป็นผู้เขียนร่วมอยู่แล้ว`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await addCollaborator(novelRef, name, credit.trim());
      setCollaborators(result.collaborators);
      setUsername("");
      setCredit("");
      router.refresh();
    } catch (cause) {
      // The FIELD message first ("ไม่พบบัญชีชื่อนี้", "คุณเป็นเจ้าของเรื่องอยู่แล้ว")
      // - the envelope's generic "Validation failed." says nothing a person
      // can act on.
      if (cause instanceof ApiError) {
        setError(
          cause.fields?.username?.[0] ?? cause.fields?.credit?.[0] ?? cause.message,
        );
      } else {
        setError("เพิ่มผู้เขียนร่วมไม่สำเร็จ");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    setBusy(true);
    setError(null);
    try {
      await removeCollaborator(novelRef, target);
      setCollaborators((current) =>
        current.filter((item) => item.username !== target),
      );
      setRemoving(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "นำออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="collaborators-heading"
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h3 id="collaborators-heading" className="flex items-center gap-1.5 text-sm font-medium">
        <Icon name="users" size={15} />
        ผู้เขียนร่วม
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        คนที่เพิ่มจะเข้าสตูดิโอของเรื่องนี้ได้ และเขียน/แก้ตอน ตัวละคร
        และตัวแปรได้เหมือนคุณ - แต่การตั้งค่า การเผยแพร่ และการลบเรื่อง
        ยังเป็นของคุณคนเดียว ชื่อของพวกเขาขึ้นหน้าเรื่องเป็น “ร่วมกับ …”
      </p>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      ) : null}

      {collaborators.length > 0 ? (
        <ul className="mt-3 divide-y divide-hairline rounded-md border border-border">
          {collaborators.map((person) => (
            <li
              key={person.username}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
            >
              {/* The row is the PERSON, same as the dropdown that added them
                  (review): avatar and both names, linked to the profile so
                  the owner can confirm they credited the right account. */}
              <a
                href={`/users/${encodeURIComponent(person.username)}`}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 flex-1 items-center gap-2.5"
              >
                {person.avatar_url ? (
                  // Avatars come from object storage - no optimizer loader.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={person.avatar_url}
                    alt=""
                    className="size-9 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary text-text-muted"
                  >
                    <Icon name="user" size={15} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium group-hover:text-primary">
                    {person.display_name ?? person.username}
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    @{person.username}
                    {person.credit ? ` · เครดิต: ${person.credit}` : ""}
                  </span>
                </span>
              </a>
              {removing === person.username ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-text-secondary">
                    นำออก? งานที่เขียนไว้ยังอยู่ครบ
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(person.username)}
                    className="inline-flex min-h-8 items-center rounded-md bg-error px-3 font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    นำออก
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(null)}
                    className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-text-secondary hover:text-text disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoving(person.username)}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-text-muted hover:border-error hover:text-error"
                >
                  <Icon name="close" size={12} />
                  นำออก
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-text-muted">ยังไม่มีผู้เขียนร่วม</p>
      )}

      <form onSubmit={add} className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor="collab-username" className="block text-xs text-text-secondary">
            ชื่อผู้ใช้ (username)
          </label>
          <div ref={searchBox} className="relative mt-1">
            <input
              id="collab-username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setListOpen(false);
              }}
              disabled={busy}
              autoComplete="off"
              role="combobox"
              aria-expanded={listOpen && (matches.length > 0 || searched)}
              aria-controls="collab-suggestions"
              placeholder="เช่น mildwriter"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 pe-9 text-sm"
            />

            {/* The "you spelled it right" mark rides INSIDE the field, so
                confirmation never reflows the row beside it. */}
            {exact ? (
              <span
                title={`พบ @${exact.username} แล้ว`}
                className="absolute inset-e-3 top-1/2 -translate-y-1/2 text-success"
              >
                <Icon name="check" size={15} />
                <span className="sr-only">พบชื่อผู้ใช้นี้แล้ว</span>
              </span>
            ) : null}

            {listOpen && username.trim().length >= 2 && (matches.length > 0 || searched) ? (
              <div
                id="collab-suggestions"
                role="listbox"
                aria-label="ชื่อผู้ใช้ที่ใกล้เคียง"
                className="absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-64 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-popover"
              >
                {matches.length > 0 ? (
                  matches.slice(0, 6).map((hit) => (
                    <button
                      key={hit.username}
                      type="button"
                      role="option"
                      aria-selected={hit.username === username.trim()}
                      onClick={() => {
                        setUsername(hit.username);
                        setListOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-start hover:bg-surface-secondary"
                    >
                      {hit.avatar_url ? (
                        // Avatars come from object storage - no optimizer loader.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={hit.avatar_url}
                          alt=""
                          className="size-8 shrink-0 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary text-text-muted"
                        >
                          <Icon name="user" size={14} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">
                          {hit.display_name || hit.username}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-text-muted">
                          @{hit.username}
                        </span>
                      </span>
                      {hit.is_author ? (
                        <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-text-muted">
                          นักเขียน
                        </span>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2.5 text-xs text-text-muted">
                    ไม่พบชื่อผู้ใช้ที่ตรงหรือใกล้เคียง - ตรวจตัวสะกดอีกครั้ง
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-40 flex-1">
          <label htmlFor="collab-credit" className="block text-xs text-text-secondary">
            เครดิตที่จะแสดง (ไม่บังคับ)
          </label>
          <input
            id="collab-credit"
            value={credit}
            onChange={(event) => setCredit(event.target.value)}
            disabled={busy}
            maxLength={120}
            placeholder="เช่น ร่วมเขียนบทที่ 5-8"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !username.trim()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Icon name="plus" size={15} />
          {busy ? "กำลังเพิ่ม…" : "เพิ่ม"}
        </button>
      </form>

      <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
        การแก้ไขยังไม่ใช่แบบเห็นสด ๆ พร้อมกัน - ต่างคนต่างแก้แล้วรีเฟรชเห็นของกัน
        ระวังแก้ตอนเดียวกันพร้อมกัน เพราะคนที่บันทึกทีหลังจะทับของอีกคน
      </p>
    </section>
  );
}
