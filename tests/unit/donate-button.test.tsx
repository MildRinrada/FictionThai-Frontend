import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DonateButton } from "@/features/author/donate-button";

/**
 * DonateButton (Phase 11): the EXTERNAL writer-support CTA. It must render only
 * when the author has a link, point outward, and stay visually/functionally
 * distinct from Premium - it never triggers a FictionThai request.
 */

describe("DonateButton", () => {
  it("renders an external link to the writer's donation URL", () => {
    render(<DonateButton donationUrl="https://easydonate.example/writer" />);
    const link = screen.getByTestId("donate-writer");
    expect(link).toHaveAttribute("href", "https://easydonate.example/writer");
    expect(link).toHaveAttribute("target", "_blank");
    // Leaving the platform entirely: no referrer/opener, marked external.
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("nofollow");
    // The label is the writer-support wording, NOT "Premium".
    expect(link).toHaveTextContent(/สนับสนุนนักเขียน/);
    expect(link).not.toHaveTextContent(/Premium/);
  });

  it("renders nothing when the author has no donation link", () => {
    const { container } = render(<DonateButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when hidden (the viewer is the author)", () => {
    const { container } = render(
      <DonateButton donationUrl="https://easydonate.example/writer" hidden />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
