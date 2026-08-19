/**
 * Authentication contract types.
 *
 * These mirror `backend/internal/users` and `backend/internal/auth`. The backend
 * is authoritative - the frontend never decides who someone is or what they may
 * do (docs/11 §43).
 */

/** Platform roles. "Writer" is deliberately absent: it is a capability a normal
 * user gains by creating a fiction, not a separate role (docs/10 §52). */
export const Role = {
  User: "user",
  Moderator: "moderator",
  Admin: "admin",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Account lifecycle states (docs/10 §18). */
export const AccountStatus = {
  Active: "active",
  PendingVerification: "pending_verification",
  Suspended: "suspended",
  Banned: "banned",
  Deleted: "deleted",
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

/** A user as seen by anyone - never includes an email address (docs/10 §8). */
export interface PublicUser {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
}

/** The authenticated user's own account view. */
export interface CurrentUser extends PublicUser {
  email: string;
  role: Role;
  status: AccountStatus;
  email_verified: boolean;
  /**
   * The account has stated once that it belongs to an adult
   * (docs/PHASE-13-CREATION-AND-CONTROL.md §13B). Required before publishing
   * 18+ work, and never asked again.
   *
   * What the server holds is a timestamp: no date of birth, no document, no
   * third party (docs/11 §34).
   */
  adult_attested: boolean;
  created_at: string;
  /** True once the user owns an author profile. Gates the Writer Studio entry. */
  is_author: boolean;
}

/**
 * Which transport a login is for.
 *
 * Declared explicitly rather than inferred from the User-Agent: a wrong guess
 * would either hand a browser a token it should not hold, or leave a native
 * client with a cookie it cannot store.
 */
export type ClientKind = "web" | "native";

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  client?: ClientKind;
}

export interface LoginRequest {
  /** Username or email - docs/10 §10 accepts either. */
  identifier: string;
  password: string;
  client?: ClientKind;
}

/**
 * The register/login response.
 *
 * `token` is present ONLY for native clients. A web client receives the session
 * in an HttpOnly cookie and must never see a token here (docs/09 §4).
 */
export interface AuthResponse {
  user: CurrentUser;
  token?: string;
  /** Echoed back in the X-CSRF-Token header on state-changing requests. */
  csrf_token?: string;
}

/** Authentication state for the client-side session context. */
export type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "guest"; user: null };
