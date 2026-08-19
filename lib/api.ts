/**
 * The single entry point for talking to the Go API.
 *
 * Everything the frontend fetches goes through here so that the response
 * envelope, the error contract, request-ID propagation, and timeouts are
 * handled in exactly one place (docs/09 §7, §41).
 *
 * The frontend holds no business logic and enforces no authorization - the API
 * decides what a user may see and do (docs/07 §5, docs/11 §43).
 */

import { apiBase, env } from "@/lib/env";
import type {
  ApiCollection,
  ApiData,
  ApiErrorBody,
  ApiErrorResponse,
  ApiMeta,
} from "@/types/api";

/** Header used to correlate a browser action with backend logs (docs/07 §49). */
export const REQUEST_ID_HEADER = "X-Request-ID";

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * A failed API call.
 *
 * `code` is the stable identifier to branch on; `requestId` is what a user can
 * quote in a bug report to find the matching server log.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody, requestId?: string) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.requestId = requestId;
  }

  /** True when the user is not signed in. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when the user is signed in but not permitted. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** JSON body; serialised automatically. */
  body?: unknown;
  /** Query parameters. `undefined` and `null` values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Abort after this many milliseconds. Defaults to 10s. */
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
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

/**
 * Performs one API request and unwraps the envelope.
 *
 * @throws {ApiError} on a non-2xx response, an unreachable API, or a timeout.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...init } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      signal: options.signal ?? controller.signal,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Send the session cookie. docs/10 §11 prefers HttpOnly cookies over
      // tokens in localStorage for browser authentication.
      credentials: "include",
    });
  } catch (cause) {
    const timedOut = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiError(
      timedOut ? 504 : 503,
      {
        code: timedOut ? "REQUEST_TIMEOUT" : "SERVICE_UNAVAILABLE",
        message: timedOut
          ? "The request took too long."
          : "Could not reach the API.",
      },
    );
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
      // A response that is not in our envelope (a proxy error page, say) still
      // has to surface as a usable ApiError.
      error ?? { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      requestId,
    );
  }

  return payload as T;
}

/** GET a single resource and unwrap `{ data }`. */
export async function getOne<T>(path: string, options?: RequestOptions): Promise<T> {
  const body = await request<ApiData<T>>(path, { ...options, method: "GET" });
  return body.data;
}

/** GET a collection and unwrap `{ data, meta }`. */
export async function getMany<T>(
  path: string,
  options?: RequestOptions,
): Promise<{ items: T[]; meta: ApiMeta }> {
  const body = await request<ApiCollection<T>>(path, { ...options, method: "GET" });
  return { items: body.data, meta: body.meta };
}

export async function post<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const response = await request<ApiData<T>>(path, { ...options, method: "POST", body });
  return response?.data;
}

export async function put<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const response = await request<ApiData<T>>(path, { ...options, method: "PUT", body });
  return response?.data;
}

export async function patch<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  const response = await request<ApiData<T>>(path, { ...options, method: "PATCH", body });
  return response?.data;
}

export async function del(path: string, options?: RequestOptions): Promise<void> {
  await request<void>(path, { ...options, method: "DELETE" });
}

/**
 * Probes the API's liveness endpoint.
 *
 * Lives outside `request` because the probes are operational endpoints and
 * deliberately do not use the `{ data }` envelope.
 */
export async function checkApiHealth(
  timeoutMs = 3_000,
): Promise<{ reachable: boolean; status?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${env.apiUrl}/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!response.ok) return { reachable: false };

    const body = (await response.json()) as { status?: string };
    return { reachable: true, status: body.status };
  } catch {
    return { reachable: false };
  }
}
