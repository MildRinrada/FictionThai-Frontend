/**
 * Discovery vocabularies, client side.
 *
 * These mirror `backend/internal/taxonomy` exactly. Genres and tags are two
 * SEPARATE vocabularies (docs/08 §14 "controlled classification" vs §15
 * "flexible discovery metadata") and must never be merged in client code
 * either. The Fiction Format System is deliberately NOT represented here -
 * formats are first-class metadata, never tags (docs/08 §15.2).
 */

/**
 * Which question a controlled term answers (§13S).
 *
 * One vocabulary, three questions. "โรแมนติก" and "Boy's Love (BL)" are not
 * alternatives - a fiction is routinely both, and a reader browsing for one is
 * not browsing for the other.
 */
export const GenreKind = {
  /** What the story is LIKE. โรแมนติก, ดราม่าปวดตับ, ตลก. */
  Content: "content",
  /** Who it is ABOUT. BL, GL, ชาย-หญิง, Reader, OC. */
  Relationship: "relationship",
  /** Which alternate universe. AU ไทย, AU มหาลัย, AU คาเฟ่. */
  AU: "au",
} as const;
export type GenreKind = (typeof GenreKind)[keyof typeof GenreKind];

/** One genre of the controlled vocabulary (docs/08 §14.1). */
export interface Genre {
  id: string;
  name: string;
  slug: string;
  kind: GenreKind;
  description?: string;
  created_at: string;
}

/** One tag of the flexible vocabulary (docs/08 §15.1). */
export interface Tag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  /** How many listed fictions carry the tag; present on browse listings. */
  novel_count?: number;
}

/**
 * The compact form both vocabularies share on a fiction resource - enough to
 * render a badge and build a filter link.
 */
export interface Term {
  id: string;
  name: string;
  slug: string;
}
