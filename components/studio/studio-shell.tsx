"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageContainer } from "@/components/shell/page-container";

/**
 * The studio's two shapes (editor review 2026-08, items A-B).
 *
 * Every studio screen is a management screen except one: the chapter editor,
 * whose only job is writing. The management screens keep the rail - the cover,
 * the counts, ภาพรวม/ตอนทั้งหมด/ตัวละคร - because moving BETWEEN surfaces is
 * what those screens are for. The editor drops it: a writer inside a chapter
 * does not want to go somewhere else, and the 216px the rail spent on saying so
 * belongs to the manuscript. The editor also widens to the shell measure, so
 * its three columns (outline · manuscript · assistant) stop fighting for the
 * studio's narrower frame.
 *
 * The split is by pathname rather than by route group so the ownership check,
 * the tally fetch, and the command palette stay in the one layout that already
 * does them. `usePathname` resolves during SSR too - neither shape flashes.
 */
const EDITOR_PATH = /^\/studio\/novels\/[^/]+\/chapters\/[^/]+\/?$/;

export function StudioShell({
  rail,
  children,
}: {
  rail: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (EDITOR_PATH.test(pathname)) {
    return (
      <PageContainer measure="shell" className="py-6 pb-16">
        <main id="main" className="min-w-0">
          {children}
        </main>
      </PageContainer>
    );
  }

  return (
    <PageContainer measure="studio" className="py-8 pb-16">
      <div className="grid gap-8 lg:grid-cols-[216px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-22 lg:self-start">{rail}</aside>
        {/* The studio's own <main>: the shell's "ข้ามไปยังเนื้อหาหลัก" link
            points at #main, and this is where it lands. */}
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
    </PageContainer>
  );
}
