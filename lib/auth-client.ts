"use client";

import { ApiError, post } from "@/lib/api";
import type {
  AuthResponse,
  CurrentUser,
  LoginRequest,
  RegisterRequest,
} from "@/types/auth";

/**
 * Browser-side authentication calls.
 *
 * The session credential is never handled here. The API sets an HttpOnly cookie
 * that this code cannot read, and the browser attaches it automatically - which
 * is exactly why an XSS payload cannot exfiltrate it (docs/11 §43).
 *
 * Nothing in this module writes to localStorage, sessionStorage, or IndexedDB.
 */

/** The readable CSRF cookie, needed for the double-submit header. */
const CSRF_COOKIE_NAMES = ["__Host-csrf", "ft_csrf"] as const;

/**
 * Reads the CSRF token from its cookie.
 *
 * This cookie is deliberately readable - unlike the session cookie. The CSRF
 * token authenticates nothing on its own; its only job is to prove the request
 * came from a page that could read our cookies.
 */
export function readCSRFToken(): string | null {
  if (typeof document === "undefined") return null;

  for (const name of CSRF_COOKIE_NAMES) {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
    );
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Headers for a state-changing request from the browser. */
function mutationHeaders(): Record<string, string> {
  const token = readCSRFToken();
  return token ? { "X-CSRF-Token": token } : {};
}

/**
 * Registers an account. The browser is signed in on success.
 *
 * `client` is always "web" here: this module only ever runs in a browser, and
 * asking for "native" would return a raw token with nowhere safe to put it.
 */
export async function register(
  input: Omit<RegisterRequest, "client">,
): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/register", { ...input, client: "web" });
}

/** Signs in. The session arrives as an HttpOnly cookie. */
export async function login(
  input: Omit<LoginRequest, "client">,
): Promise<AuthResponse> {
  return post<AuthResponse>("/auth/login", { ...input, client: "web" });
}

/** Ends this session only, leaving other devices signed in. */
export async function logout(): Promise<void> {
  await post("/auth/logout", undefined, { headers: mutationHeaders() });
}

/** Ends every session on every device (docs/10 §37). */
export async function logoutAllDevices(): Promise<void> {
  await post("/auth/logout-all", undefined, { headers: mutationHeaders() });
}

/** Requests a password-reset email. Always succeeds, whether or not the address
 * is registered - the response must not reveal that (docs/10 §16). */
export async function requestPasswordReset(email: string): Promise<void> {
  await post("/auth/password/forgot", { email });
}

/** Redeems a reset token and sets a new password. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await post("/auth/password/reset", { token, password });
}

/** Redeems an email-verification token. */
export async function verifyEmail(token: string): Promise<void> {
  await post("/auth/verify-email", { token });
}

/**
 * Records the account's one-time statement that it belongs to an adult (§13B).
 *
 * No body: the request IS the statement, and a payload would invite exactly the
 * extra fields - a birth date, a document - that this deliberately does not
 * collect. There is no way to take it back through the API either; "I am not an
 * adult" is not an edit to a profile field.
 */
export async function attestAdult(): Promise<CurrentUser> {
  return post<CurrentUser>("/auth/adult-attestation", {}, {
    headers: mutationHeaders(),
  });
}

/**
 * Fetches the current user from the browser, or null for a guest.
 *
 * Server Components should use `lib/auth.ts` instead - this exists for client
 * components that need to refresh identity after a sign-in without a full
 * navigation.
 */
export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    const { getOne } = await import("@/lib/api");
    return await getOne<CurrentUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return null;
    throw error;
  }
}

/**
 * Turns an ApiError into a message and per-field errors for a form.
 *
 * Field errors come straight from the API's 422 payload, so the frontend never
 * duplicates a validation rule - the server stays the single source of truth
 * (docs/11 §43).
 */
export function formErrors(error: unknown): {
  message: string;
  fields: Record<string, string[]>;
} {
  if (error instanceof ApiError) {
    return { message: error.message, fields: error.fields ?? {} };
  }
  return {
    message: "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง",
    fields: {},
  };
}
