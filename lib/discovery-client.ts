"use client";

import { getMany, getOne, post } from "@/lib/api";
import { readCSRFToken } from "@/lib/auth-client";
import type { ApiMeta } from "@/types/api";
import type { Novel, NovelListQuery } from "@/types/novel";
import type { Genre, Tag } from "@/types/taxonomy";

/**
 * Browser-side discovery calls: vocabularies and search.
 *
 * Everything here except tag creation is public - browsing and searching must
 * work for a guest (docs/03 §9 "Search should remain available to guests").
 * The vocabularies come from the server so web and mobile can never disagree
 * with the API about what a genre is (docs/09 §51's principle).
 */

/** Headers for a state-changing request from the browser. */
function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/** The controlled genre vocabulary, alphabetical (docs/08 §14.1). */
export async function getGenres(): Promise<Genre[]> {
  return getOne<Genre[]>("/genres");
}

/** Tags for browsing or typeahead, most-used first (docs/01 §6). */
export async function getTags(
  query: { q?: string; page?: number } = {},
): Promise<{ items: Tag[]; meta: ApiMeta }> {
  return getMany<Tag>("/tags", { query: { ...query } });
}

/**
 * Resolves a writer's tag name to its row, creating it when new. Idempotent -
 * an existing name returns the same tag (docs/09 §33). The server enforces
 * the naming rules and the format-metadata ban (docs/08 §15.2); this client
 * adds nothing to them.
 */
export async function createTag(name: string): Promise<Tag> {
  return post<Tag>("/tags", { name }, { headers: mutationHeaders() });
}

/**
 * Searches fictions (docs/09 §22). `q` is required by the API; the widened
 * scope - title, description, author, genre and tag names - lives server-side
 * (docs/01 §7).
 */
export async function searchNovels(
  query: NovelListQuery & { q: string },
): Promise<{ items: Novel[]; meta: ApiMeta }> {
  return getMany<Novel>("/search/novels", { query: { ...query } });
}
