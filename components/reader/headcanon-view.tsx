import { RichText } from "@/components/reader/rich-text";
import type { TokenSlot } from "@/components/reader/variable-text";
import type { HeadcanonEntry } from "@/types/novel";

/**
 * Headcanon presentation - the third representation
 * (docs/PHASE-12-STORY-DEPTH.md §12F, docs/PHASE-13-CREATION-AND-CONTROL.md §13J).
 *
 * A Server Component: entries are static content, so this ships no JavaScript
 * (docs/07 §20). Every value is plain text and React escapes it on render
 * (docs/11 §17).
 *
 * One card per character rather than a table. A table would force every entry
 * to the height of the longest one, and 12F is explicit that entry length is
 * unknown by nature - the field values stay a compact header line, and the body
 * runs as long as it runs.
 */

export interface HeadcanonViewProps {
  entries: HeadcanonEntry[];
  /** The topic's field labels. Values answer them positionally. */
  fields: string[];
  /** Reader-variable slots (§13H). An entry can be about the reader too. */
  slots?: TokenSlot[];
}

export function HeadcanonView({ entries, fields, slots = [] }: HeadcanonViewProps) {
  return (
    <ol className="reading-surface flex flex-col gap-5" aria-label="รายการเฮดแคนอน">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-lg border border-reader-rule px-5 py-4"
        >
          {/*
            The field's answer rides the NAME LINE, joined by a pipe (editor
            review 2026-08): เอเธอร์ (Aether) | เปอร์เซ็นต์ที่จีบติด: 20%.
            The composer allows one field per topic now; entries written when
            several were possible keep every answer, joined the same way. A
            value with no label is still the author's answer, so it renders
            without one rather than being dropped.
          */}
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {entry.name}
            {entry.values.map((value, slot) =>
              value ? (
                <span key={slot} className="font-normal text-reader-muted">
                  {" | "}
                  {fields[slot] ? `${fields[slot]}: ` : ""}
                  <span className="text-reader-text">{value}</span>
                </span>
              ) : null,
            )}
          </h2>

          {/*
            The author's picture for this entry (§13M), above the body because
            it is context for what follows rather than an illustration of it.
            Height-capped and never cropped: a headcanon picture is as likely to
            be a tall portrait as a wide scene, and `object-contain` shows the
            author's whole frame either way. Lazy by default, so a topic with
            twenty pictures still opens at the top.
          */}
          {entry.image_url ? (
            /* Centred, always (editor review 2026-08): the box's picture is
               its banner, and a banner does not lean left or right. */
            /* eslint-disable-next-line @next/next/no-img-element -- served from
               our own immutable /media route; next/image would add a proxy hop
               and a layout guess for an image whose dimensions we do not store. */
            <img
              src={entry.image_url}
              alt={`ภาพประกอบของ ${entry.name}`}
              loading="lazy"
              className="mx-auto mt-3 block max-h-104 w-auto rounded-md border border-reader-rule object-contain"
            />
          ) : null}

          {/*
            The body is formatted text now (§13R): an entry is written in the
            same live editor a chapter is, with the same toolbar, so what it
            can carry is the same restricted markup - and read through the same
            renderer, which builds elements from a parse and never from HTML.
          */}
          {entry.body ? (
            <RichText content={entry.body} slots={slots} className="ft-prose mt-3 leading-loose" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
