import { SectionHeader } from "@/components/ui/section-header";
import { Icon } from "@/components/ui/icon";
import type { Character } from "@/types/character";

/**
 * The cast, on the fiction page.
 *
 * A Server Component with no interactivity: every character is expanded on the
 * page rather than hidden behind a click. The prototype opened one character at
 * a time in a detail panel, which costs a client island and hides the thing the
 * section exists to show. Cards first, then the full detail of each - a reader
 * scanning for "who is ป้าแดง" finds the answer by scrolling, and a search
 * inside the page finds it too.
 *
 * Every value here is authored. Nothing is derived from the chapter text, and a
 * character with only a name renders as a character with only a name.
 */
export function CharacterSection({ characters }: { characters: Character[] }) {
  if (characters.length === 0) return null;

  return (
    <section aria-labelledby="cast-heading" className="mb-10">
      <SectionHeader
        id="cast-heading"
        title="ตัวละครในเรื่องนี้"
        subLabel={`${characters.length} characters`}
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {characters.map((character) => (
          <li key={character.id}>
            <CharacterCard character={character} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One reader-facing character card. Exported so the studio's cast editor can
 * show the writer EXACTLY what readers will see - same component, not a
 * lookalike that could drift.
 */
export function CharacterCard({ character }: { character: Character }) {
  const hasDetail =
    character.description ||
    character.quote ||
    character.details.length > 0 ||
    character.traits.length > 0;

  return (
    <article className="h-full rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="art-placeholder flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border">
          {character.avatar_url ? (
            // Character art is served from object storage, an origin the image
            // optimizer has no configured loader for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            <Icon name="user" size={17} className="text-text-muted" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base leading-snug font-semibold">
            {character.name}
          </h3>
          {character.role ? (
            <p className="mt-0.5 text-xs text-primary">{character.role}</p>
          ) : null}
          {character.summary ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
              {character.summary}
            </p>
          ) : null}
        </div>
      </div>

      {character.traits.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {character.traits.map((trait) => (
            <li
              key={trait}
              className="inline-flex min-h-6 items-center rounded-sm border border-border px-2 text-[11px] text-text-secondary"
            >
              {trait}
            </li>
          ))}
        </ul>
      ) : null}

      {character.details.length > 0 ? (
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-hairline pt-3 text-[13px]">
          {character.details.map((detail) => (
            <div key={detail.label} className="flex gap-3">
              <dt className="w-24 shrink-0 text-text-muted">{detail.label}</dt>
              <dd className="min-w-0 flex-1">{detail.value || "-"}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {character.quote ? (
        // The one place coral appears in a character card: a line the character
        // says, not a UI state.
        <blockquote className="mt-3 border-s-2 border-secondary ps-3 font-serif text-[13px] leading-relaxed text-text-secondary">
          {character.quote}
        </blockquote>
      ) : null}

      {character.description ? (
        <p className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap text-text-secondary">
          {character.description}
        </p>
      ) : null}

      {!hasDetail ? (
        <p className="mt-3 text-xs text-text-muted">ยังไม่มีรายละเอียดเพิ่มเติม</p>
      ) : null}
    </article>
  );
}
