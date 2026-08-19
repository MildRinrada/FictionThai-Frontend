import type { Metadata } from "next";
import { cookies } from "next/headers";

import { PageContainer } from "@/components/shell/page-container";
import { SearchView } from "@/features/search/search-view";
import { ADULT_COOKIE, showsAdult } from "@/lib/adult-pref";
import { serverGetMany, serverGetOne, serverGetPublic } from "@/lib/api-server";
import { isAuthenticated } from "@/lib/auth";
import {
  activeFilterCount,
  apiQueryFromFilters,
  filtersFromParams,
  searchTabOf,
  type SearchFacets,
  type SearchFilters,
} from "@/lib/search-client";
import type { ApiMeta } from "@/types/api";
import type { Novel } from "@/types/novel";
import type { Genre } from "@/types/taxonomy";

/**
 * Search - docs/03 §9 `/search`, reworked per the 2026-08 search review.
 *
 * Still a URL-driven page: this Server Component renders the FIRST state from
 * the address (results, facets, filters), so a shared link paints without
 * JavaScript and crawlers see real results. After hydration the client view
 * takes over - typing and filtering fetch shallowly and pushState the URL,
 * so the address stays shareable while the page never reloads.
 */

export const metadata: Metadata = {
  title: "ค้นหานิยาย",
  description: "ค้นหานิยายจากชื่อเรื่อง นักเขียน แฟนด้อม หมวดหมู่ หรือแท็ก",
};

const REVALIDATE_SECONDS = 60;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

async function loadInitial(
  filters: SearchFilters,
  widened: boolean,
): Promise<{
  results: { items: Novel[]; meta: ApiMeta } | null;
  facets: SearchFacets | null;
}> {
  const attempted = filters.q !== "" || activeFilterCount(filters) > 0;
  if (!attempted) return { results: null, facets: null };

  const query = apiQueryFromFilters(filters);
  const path = filters.q ? "/search/novels" : "/novels";

  const facetsQuery = { ...query };
  delete facetsQuery.sort;
  delete facetsQuery.page;

  // A malformed shared link (an unsupported filter value answers 422) still
  // renders the page - the client view reports it as an empty result.
  const [results, facets] = await Promise.all([
    serverGetMany<Novel>(path, {
      query,
      authenticated: widened,
      ...(widened ? {} : { revalidate: REVALIDATE_SECONDS }),
    }).catch(() => null),
    serverGetOne<SearchFacets>("/search/facets", {
      query: facetsQuery,
      authenticated: widened,
      ...(widened ? {} : { revalidate: REVALIDATE_SECONDS }),
    }).catch(() => null),
  ]);
  return { results, facets };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // The same parser the client uses, so the server's first paint and the
  // hydrated state can never disagree about what the URL means.
  const urlParams = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const value = firstValue(params[key]);
    if (value !== "") urlParams.set(key, value);
  }
  const filters = filtersFromParams(urlParams);
  const tab = searchTabOf(urlParams.get("type"));

  // ซ่อนเนื้อหา 18+ (§13B): honoured only for a signed-in reader who opted in.
  const cookieStore = await cookies();
  const signedIn = await isAuthenticated();
  const widened = showsAdult(cookieStore.get(ADULT_COOKIE)?.value) && signedIn;
  filters.adult = widened;

  const [genres, initial] = await Promise.all([
    serverGetPublic<Genre[]>("/genres", { revalidate: REVALIDATE_SECONDS }).catch(
      (): Genre[] => [],
    ),
    loadInitial(filters, widened),
  ]);

  return (
    <main id="main">
      <PageContainer className="py-8 pb-16">
        <h1 className="sr-only">ค้นหานิยาย</h1>
        <SearchView
          initialFilters={filters}
          initialTab={tab}
          initialResults={initial.results}
          initialFacets={initial.facets}
          genres={genres}
          signedIn={signedIn}
        />
      </PageContainer>
    </main>
  );
}
