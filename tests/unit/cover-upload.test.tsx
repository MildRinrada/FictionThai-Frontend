import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The cover control's ownership gate. The novel page is served from the
 * public cache, so the server-rendered is_owner is the guest view - the
 * island must re-ask the API when a session hint exists, and must stay
 * hidden for everyone the API does not confirm (docs/14 §7, docs/10 §27).
 */

const getNovel = vi.fn();
const uploadMedia = vi.fn();

vi.mock("@/lib/novels-client", () => ({
  getNovel: (...args: unknown[]) => getNovel(...args),
}));

vi.mock("@/lib/media-client", () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let CoverUpload: typeof import("@/features/media/cover-upload").CoverUpload;

beforeEach(async () => {
  ({ CoverUpload } = await import("@/features/media/cover-upload"));
});

afterEach(() => {
  getNovel.mockReset();
  uploadMedia.mockReset();
  document.cookie = "ft_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("CoverUpload", () => {
  it("stays hidden for guests without extra fetches", () => {
    render(<CoverUpload novelRef="my-novel" initialIsOwner={false} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(getNovel).not.toHaveBeenCalled();
  });

  it("reveals the control when the API confirms ownership after mount", async () => {
    document.cookie = "ft_csrf=session";
    getNovel.mockResolvedValue({ id: "n1", is_owner: true });

    render(<CoverUpload novelRef="my-novel" initialIsOwner={false} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "อัปโหลดปกนิยาย" }),
      ).toBeInTheDocument(),
    );
    expect(getNovel).toHaveBeenCalledWith("my-novel");
  });

  it("stays hidden when the API says the caller is not the owner", async () => {
    document.cookie = "ft_csrf=session";
    getNovel.mockResolvedValue({ id: "n1", is_owner: false });

    render(<CoverUpload novelRef="my-novel" initialIsOwner={false} />);

    await waitFor(() => expect(getNovel).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders immediately when the server already said owner", () => {
    render(<CoverUpload novelRef="my-novel" initialIsOwner />);

    expect(
      screen.getByRole("button", { name: "อัปโหลดปกนิยาย" }),
    ).toBeInTheDocument();
    expect(getNovel).not.toHaveBeenCalled();
  });
});
