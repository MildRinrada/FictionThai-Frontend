import type { ReactNode } from "react";

/**
 * The page frame.
 *
 * Every full-width surface uses this one container so the header, the content,
 * and the footer align down a single edge. The width comes from `--page-width`
 * so it is a token change, not a search-and-replace, if the measure ever moves.
 *
 * `measure="studio"` is the one exception, and it is a writing surface rather
 * than a reading one: the studio spends its width on a rail, a composer, and a
 * publishing panel simultaneously, which leaves the composer too narrow at the
 * reader's measure. It is a second token, not a wider first one - the reading
 * measure is a designed constraint and must not drift because a tool page
 * needed room.
 *
 * `measure="shell"` is the header and the footer (§13R). A site header is not
 * a column of prose: it is the frame around every column, and at the reading
 * measure it sat visibly narrower than the studio underneath it - the logo
 * indented from the edge of a page whose content began further out. It takes
 * the widest measure of the three so the chrome frames the content instead of
 * hanging inside it.
 */
export function PageContainer({
  children,
  className = "",
  as: Element = "div",
  measure = "page",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "main" | "header" | "footer" | "section" | "nav";
  measure?: "page" | "studio" | "shell";
}) {
  const width =
    measure === "studio"
      ? "max-w-[var(--studio-width)]"
      : measure === "shell"
        ? "max-w-[var(--shell-width)]"
        : "max-w-[var(--page-width)]";

  return (
    <Element
      className={`mx-auto w-full ${width} px-5 sm:px-8 lg:px-[var(--page-gutter)] ${className}`}
    >
      {children}
    </Element>
  );
}
