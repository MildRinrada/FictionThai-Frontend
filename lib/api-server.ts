import "server-only";

import { cookies } from "next/headers";

import { ApiError, REQUEST_ID_HEADER } from "@/lib/api";
import { apiBase } from "@/lib/env";
import type { ApiCollection, ApiData, ApiErrorResponse, ApiMeta } from "@/types/api";

/**
 * Server-side API client for Server Components, Server Actions, and Route
 * Handlers.
 *
 * `lib/api.ts` uses `credentials: "include"`, which is correct in the browser -
 * but a Server Component runs on the server and has NO cookie jar, so that
 * setting does nothing there. A server-rendered page would render as if the
 * visitor were signed out.
 *
 * This module forwards the incoming request's cookies explicitly via
 * `next/headers`. The session cookie is HttpOnly, so it is never readable from
 * client JavaScript - it only ever travels server-to-server here (docs/11 §43).
 *
 * The `server-only` import makes a mistaken client-side import a BUILD error
 * rather than a runtime credential leak.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export interface ServerRequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Next.js cache behaviour. Defaults to "no-store" for authenticated reads. */
  cache?: RequestCache;
  /** Revalidation window in seconds, for cacheable public reads. */
  revalidate?: number;
  /**
   * Cache tags, so a write can expire exactly the reads it invalidated.
   *
   * Without one, a public read stays stale for its whole window - which a
   * writer who has just saved their profile experiences as the save not
   * working (docs/PROFILE-AND-ACHIEVEMENTS.md Part 1).
   */
  tags?: string[];
  timeoutMs?: number;
  /**
   * Forward the visitor's session cookie. Defaults to true.
   *
   * Set false for genuinely public data so the response is cacheable and can
   * be shared between visitors - a personalised response must never end up in
   * a shared cache (docs/14 §7, docs/09 §32).
   */
  authenticated?: boolean;
}

function buildUrl(path: string, query?: ServerRequestOptions["query"]): string {
  const url = new URL(`${apiBase}${path.startsWith("/") ? path : `/${path}`}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function serverRequest<T>(
  path: string,
  options: ServerRequestOptions = {},
): Promise<T> {
  const {
    query,
    cache,
    revalidate,
    tags,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    authenticated = true,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };

  if (authenticated) {
    // Forward the whole cookie header rather than picking out the session
    // cookie by name: the name differs between development and production
    // (the `__Host-` prefix requires HTTPS), and hard-coding it here would
    // silently break one of the two environments.
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (cookieHeader) {
      headers.cookie = cookieHeader;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      headers,
      signal: controller.signal,
      // An authenticated response must never be cached: it is specific to one
      // visitor. Only explicitly public reads opt into caching.
      cache: cache ?? (authenticated ? "no-store" : undefined),
      next:
        revalidate !== undefined || tags !== undefined
          ? { ...(revalidate !== undefined ? { revalidate } : {}), ...(tags ? { tags } : {}) }
          : undefined,
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiError(timedOut ? 504 : 503, {
      code: timedOut ? "REQUEST_TIMEOUT" : "SERVICE_UNAVAILABLE",
      message: timedOut ? "The request took too long." : "Could not reach the API.",
    });
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers.get(REQUEST_ID_HEADER) ?? undefined;

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const error = (payload as ApiErrorResponse | undefined)?.error;
    throw new ApiError(
      response.status,
      error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      requestId,
    );
  }

  return payload as T;
}

/** GET a single resource from a Server Component, unwrapping `{ data }`. */
export async function serverGetOne<T>(
  path: string,
  options?: ServerRequestOptions,
): Promise<T> {
  const body = await serverRequest<ApiData<T>>(path, options);
  return body.data;
}

/** GET a collection from a Server Component, unwrapping `{ data, meta }`. */
export async function serverGetMany<T>(
  path: string,
  options?: ServerRequestOptions,
): Promise<{ items: T[]; meta: ApiMeta }> {
  const body = await serverRequest<ApiCollection<T>>(path, options);
  return { items: body.data, meta: body.meta };
}

/**
 * GET genuinely public data with no credentials attached.
 *
 * Use this for fiction listings and published chapters: the response is
 * identical for every visitor, so it can be cached and shared. Calling the
 * authenticated variant instead would make every public page uncacheable.
 */
export async function serverGetPublic<T>(
  path: string,
  options?: Omit<ServerRequestOptions, "authenticated">,
): Promise<T> {
  const body = await serverRequest<ApiData<T>>(path, {
    ...options,
    authenticated: false,
  });
  return body.data;
}
