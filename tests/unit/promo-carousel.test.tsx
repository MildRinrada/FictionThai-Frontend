import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PromoCarousel } from "@/features/home/promo-carousel";
import type { PromoSlide } from "@/types/promo";

/**
 * The hero carousel's binding rules (docs/HOME-PROMO.md):
 *
 *   - a queue of ONE is a static card - no dots, no arrows, no timer;
 *   - a paid slide always carries its "โปรโมท" chip;
 *   - arrows and dots move the deck; a click pings the counter exactly once
 *     and never blocks navigation.
 */

const pingSlideClick = vi.fn();
const push = vi.fn();

vi.mock("@/lib/promo-client", () => ({
  pingSlideClick: (...a: unknown[]) => pingSlideClick(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// jsdom has no matchMedia; the carousel asks it about reduced motion.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(() => {
  pingSlideClick.mockReset();
  push.mockReset();
});

function slide(overrides: Partial<PromoSlide> = {}): PromoSlide {
  return {
    id: crypto.randomUUID(),
    headline: "พาดหัวสไลด์",
    link_url: "/novel/my-story",
    text_side: "start",
    source: "editorial",
    ...overrides,
  };
}

describe("PromoCarousel", () => {
  it("renders one slide as a static card - no carousel chrome", () => {
    render(<PromoCarousel slides={[slide()]} />);
    expect(screen.getByText("พาดหัวสไลด์")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "สไลด์ถัดไป" })).not.toBeInTheDocument();
  });

  it("labels a paid slide โปรโมท - always", () => {
    render(<PromoCarousel slides={[slide({ source: "paid" })]} />);
    expect(screen.getByText("โปรโมท")).toBeInTheDocument();
  });

  it("moves between slides with arrows and dots", () => {
    const slides = [
      slide({ headline: "สไลด์หนึ่ง" }),
      slide({ headline: "สไลด์สอง" }),
      slide({ headline: "สไลด์สาม" }),
    ];
    render(<PromoCarousel slides={slides} />);

    expect(screen.getByText("สไลด์หนึ่ง")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "สไลด์ถัดไป" }));
    expect(screen.getByText("สไลด์สอง")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /สไลด์ที่ 3/ }));
    expect(screen.getByText("สไลด์สาม")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "สไลด์ก่อนหน้า" }));
    expect(screen.getByText("สไลด์สอง")).toBeInTheDocument();
  });

  it("pings the click counter once and routes on a plain click", () => {
    const only = slide();
    render(<PromoCarousel slides={[only]} />);

    fireEvent.click(screen.getByRole("link", { name: /พาดหัวสไลด์/ }));

    expect(pingSlideClick).toHaveBeenCalledTimes(1);
    expect(pingSlideClick).toHaveBeenCalledWith(only.id);
    expect(push).toHaveBeenCalledWith("/novel/my-story");
  });
});
