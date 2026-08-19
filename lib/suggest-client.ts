import { getMany, getOne } from "@/lib/api";
import type { DeskHit } from "@/types/desk";
import type { Novel } from "@/types/novel";
import type { Tag } from "@/types/taxonomy";

/**
 * The header's suggestion box - four questions, asked at once.
 *
 * "ค้นหา" on a fiction platform means four different things depending on who is
 * typing: a story, the person who wrote it, a tag to browse, or - for a writer -
 * their own unpublished chapter. Sending all four to one results page and
 * letting the reader sort it out is what makes site search feel useless; asking
 * all four and labelling the answers is what makes it feel like it knows the
 * site.
 *
 * Every group fails independently. A slow or broken tag lookup must not take
 * the story results down with it, so each promise resolves to an empty list
 * rather than rejecting the set.
 */

export interface AuthorHit {
  username: string;
  display_name?: string;
  avatar_url?: string;
  is_author: boolean;
}

export interface Suggestions {
  novels: Novel[];
  authors: AuthorHit[];
  tags: Tag[];
  /** The caller's own work, drafts included. Empty for a guest. */
  own: DeskHit[];
}

const PER_GROUP = 5;

export const EMPTY_SUGGESTIONS: Suggestions = {
  novels: [],
  authors: [],
  tags: [],
  own: [],
};

/**
 * @param signedIn whether to ask for the caller's own drafts. Asking as a guest
 * would be a guaranteed 401 on every keystroke.
 */
export async function suggest(
  query: string,
  { signedIn, signal }: { signedIn: boolean; signal?: AbortSignal },
): Promise<Suggestions> {
  const q = query.trim();
  if (q === "") return EMPTY_SUGGESTIONS;

  const [novels, authors, tags, own] = await Promise.all([
    getMany<Novel>("/search/novels", { query: { q, per_page: PER_GROUP }, signal })
      .then((page) => page.items)
      .catch(() => []),
    getOne<AuthorHit[]>("/search/authors", { query: { q }, signal }).catch(() => []),
    getMany<Tag>("/tags", { query: { q, per_page: PER_GROUP }, signal })
      .then((page) => page.items)
      .catch(() => []),
    signedIn
      ? getOne<DeskHit[]>("/me/desk/search", { query: { q }, signal }).catch(() => [])
      : Promise.resolve<DeskHit[]>([]),
  ]);

  return { novels, authors, tags, own };
}
