import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Noto_Sans_Thai, Noto_Serif_Thai } from "next/font/google";

import { FooterGate } from "@/components/shell/footer-gate";
import { SiteFooter } from "@/components/shell/site-footer";
import { ChromeAutoHide } from "@/components/shell/chrome-autohide";
import { SiteHeader } from "@/components/shell/site-header";
import { StudioFooter } from "@/components/shell/studio-footer";
import { THEME_INIT_SCRIPT } from "@/components/shell/theme-toggle";
import { env } from "@/lib/env";

import "./globals.css";
import { EggWatcher } from "@/features/achievements/egg-watcher";

/*
 * Thai-first typography (docs/05 §11). All three faces are self-hosted by
 * next/font, which avoids a third-party font request on every page load and
 * eliminates the layout shift a late-arriving webfont would cause.
 *
 * Sans is the UI face; serif carries titles, headings, and the reading surface;
 * mono is the structural voice used only for micro-labels and counts.
 */
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-sans-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

const notoSerifThai = Noto_Serif_Thai({
  variable: "--font-noto-serif-thai",
  subsets: ["thai", "latin"],
  display: "swap",
});

/*
 * Mono appears at 10px in tracked-out uppercase labels and in tabular counts -
 * never in body copy. It therefore needs latin only (Thai never renders in it)
 * and two weights, which keeps it a small download.
 */
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: {
    default: "FictionThai",
    template: "%s · FictionThai",
  },
  description:
    "แพลตฟอร์มนิยายไทยสำหรับนักเขียนและนักอ่าน - อ่านได้ทันทีโดยไม่ต้องสมัครสมาชิก",
  // Guest reading is a first-class experience, so public pages are indexable.
  // Draft and private content is never served publicly, so it can never be
  // indexed (docs/10 §30).
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pinch-zoom must not be disabled: text scaling is an accessibility
  // requirement (docs/05 §31).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#111116" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${notoSerifThai.variable} ${ibmPlexMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/*
          Applies a saved theme choice BEFORE first paint. Without it a reader
          who picked "สว่าง" on a dark device would see the dark theme flash on
          every navigation. It reads one localStorage key and adds one class.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/*
          A skip link is the first focusable element on every page. Keyboard
          readers must be able to reach the fiction without tabbing through the
          shell each time (docs/05 §31).
        */}
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
        >
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <SiteHeader />
        {/* โหมดอ่าน: the shell gets out of the way on /read, and comes
            straight back the moment the reader scrolls up. */}
        <ChromeAutoHide />
        {/* The bottom padding clears the fixed mobile navigation, which would
            otherwise sit on top of the last section of every page. */}
        <div className="flex-1 pb-14 md:pb-0">{children}</div>
        {/* The four client-side easter eggs. It never interrupts writing:
            an unlock waits until the writer is out of the editor
            (docs/PROFILE-AND-ACHIEVEMENTS.md Part 3). */}
        <EggWatcher />
        {/* The studio gets the thin footer (§13T): its bottom half belongs to
            the writer's work, not to the platform's marketing. */}
        <FooterGate full={<SiteFooter />} slim={<StudioFooter />} />

      </body>
    </html>
  );
}
