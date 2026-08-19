"use client";

import { usePathname } from "next/navigation";

/**
 * Chooses which footer a route gets (§13T).
 *
 * The studio is the writer's back office, and the site footer is a front-door
 * device: a statistics band, four link columns, and the full genre index. None
 * of that works for the person who owns the page - it is marketing shown to
 * someone already inside - so /studio gets the slim bar instead.
 *
 * A client gate around two server-rendered slots rather than a route-group
 * restructure: both footers arrive as fully rendered children and this
 * component only picks one, so the reader path ships the same zero-JS footer
 * it always did plus one pathname check.
 */
export function FooterGate({
  full,
  slim,
}: {
  full: React.ReactNode;
  slim: React.ReactNode;
}) {
  const pathname = usePathname();
  const inStudio = pathname === "/studio" || pathname.startsWith("/studio/");
  return inStudio ? slim : full;
}
