/**
 * Shared API contract types.
 *
 * These mirror the response envelope defined in `docs/09 - API Specification.md`
 * §7. They are hand-written rather than generated: docs/09 §43 wants an OpenAPI
 * contract eventually, but introducing a generation pipeline for a handful of
 * types would be premature. When the OpenAPI spec exists, generate into this
 * directory and delete the hand-written duplicates.
 */

/** Pagination metadata returned alongside every collection. */
export interface ApiMeta {
  page: number;
  per_page: number;
  total: number;
}

/** A single-resource success response. */
export interface ApiData<T> {
  data: T;
}

/** A paginated collection response. */
export interface ApiCollection<T> {
  data: T[];
  meta: ApiMeta;
}

/**
 * The error payload.
 *
 * Branch on `code`, never on `message` - docs/09 §7 is explicit that messages
 * are human-readable and may change, while codes are the stable contract.
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  /** Present on 422 validation failures, keyed by field name. */
  fields?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/** Stable error codes. Keep in sync with `backend/pkg/apierror`. */
export const ApiErrorCode = {
  BadRequest: "BAD_REQUEST",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  Validation: "VALIDATION_ERROR",
  RateLimited: "RATE_LIMIT_EXCEEDED",
  PayloadTooLarge: "PAYLOAD_TOO_LARGE",
  Internal: "INTERNAL_ERROR",
  Unavailable: "SERVICE_UNAVAILABLE",
  InvalidFictionFormat: "INVALID_FICTION_FORMAT",
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Liveness probe payload (`GET /health`). */
export interface HealthResponse {
  status: "ok";
}

/** Readiness probe payload (`GET /ready`). */
export interface ReadyResponse {
  status: "ok" | "degraded";
  version: string;
  /** Per-dependency status: "ok" | "degraded" | "disabled". */
  checks: Record<string, string>;
}
