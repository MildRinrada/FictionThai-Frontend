"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A primary navigation link that knows whether it is the current section.
 *
 * The only reason this is a client island: the active state depends on the
 * pathname, which a Server Component in the root layout cannot read without
 * making the entire shell dynamic. Keeping it to this one small component
 * leaves the rest of the header a Server Component (docs/07 §20).
 *
 * `aria-current` carries the meaning; the weight and colour change are the
 * visual echo of it, never the only signal (docs/05 §31).
 */
export function NavLink({
  href,
  children,
  className = "",
  activeClassName = "text-text font-medium",
  inactiveClassName = "text-text-secondary hover:text-text",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
}) {
  const pathname = usePathname();
  // "/" must match exactly; every other section also owns its subtree, so
  // /novel/… keeps "สำรวจ" lit while reading.
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : inactiveClassName}`}
    >
      {children}
    </Link>
  );
}
