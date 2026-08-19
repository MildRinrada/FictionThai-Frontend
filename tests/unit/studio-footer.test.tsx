import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudioFooter } from "@/components/shell/studio-footer";

/**
 * The footer review (2026-08): the studio footer is a LIGHT band, and the
 * theme toggle's default paint is for the main site's dark band - white text,
 * invisible here in the light theme, active and inactive alike.
 */
describe("StudioFooter", () => {
  it("paints the theme toggle for a light surface, not the dark band", () => {
    render(<StudioFooter />);

    const active = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true");
    expect(active).toBeDefined();
    expect(active!.className).not.toContain("text-white");
    expect(active!.className).toContain("text-text");

    const inactive = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "false");
    for (const button of inactive) {
      expect(button.className).not.toContain("#a09ca8");
    }
  });
});
