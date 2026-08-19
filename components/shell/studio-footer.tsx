import Link from "next/link";

import { PageContainer } from "@/components/shell/page-container";
import { ThemeToggle } from "@/components/shell/theme-toggle";

/**
 * The studio's footer (§13T): copyright, contact, theme - and nothing else.
 *
 * Deliberately thin. The writer scrolling past their own backlog does not need
 * the statistics band or the genre index; the bottom half of a studio page
 * belongs to the writer's work, not to the platform's pitch.
 */
export function StudioFooter() {
  return (
    <footer className="mt-18 border-t border-hairline">
      <PageContainer
        measure="shell"
        className="flex flex-wrap items-center gap-x-5 gap-y-2 py-4 text-xs text-text-secondary"
      >
        {/* Buddhist era, which is what a Thai writer expects to see. */}
        <span>© {new Date().getFullYear() + 543} FictionThai</span>
        <span>งานเขียนทั้งหมดเป็นลิขสิทธิ์ของผู้เขียนแต่ละคน</span>
        <Link href="/contact" className="hover:text-text">
          ติดต่อทีมงาน
        </Link>
        <span className="ms-auto">
          {/* onSurface, not the default onDark: this footer is a normal light
              band, and the dark-band paint put white text on it - the active
              theme button was literally invisible (footer review 2026-08). */}
          <ThemeToggle tone="onSurface" />
        </span>
      </PageContainer>
    </footer>
  );
}
