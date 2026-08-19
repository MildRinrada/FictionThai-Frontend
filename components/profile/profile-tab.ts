/**
 * The profile-tab vocabulary, shared by the SERVER pages that parse ?tab= and
 * the client tab row that switches them. Its own module because the row is a
 * Client Component and a server page cannot call a client module's function.
 */

export const PROFILE_TABS = ["works", "shelves", "wall", "timeline"] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

/** The addresses that existed before the rework keep resolving somewhere sane. */
const LEGACY_TABS: Record<string, ProfileTab> = {
  writing: "works",
  "pen-names": "works",
};

export function profileTabOf(raw: string | undefined): ProfileTab {
  if (PROFILE_TABS.includes(raw as ProfileTab)) return raw as ProfileTab;
  return LEGACY_TABS[raw ?? ""] ?? "works";
}
