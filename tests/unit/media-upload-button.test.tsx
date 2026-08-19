import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * The upload control. What matters: the selected file goes to the client with
 * its purpose (and novel ref when present), success reaches the callback,
 * server refusals surface as Thai messages, and a guest's attempt routes to
 * sign-in with intent preserved (docs/02 §5.2).
 */

const uploadMedia = vi.fn();
const push = vi.fn();

vi.mock("@/lib/media-client", () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

let MediaUploadButton: typeof import("@/features/media/media-upload-button").MediaUploadButton;

beforeEach(async () => {
  ({ MediaUploadButton } = await import("@/features/media/media-upload-button"));
});

afterEach(() => {
  uploadMedia.mockReset();
  push.mockReset();
});

function pickFile(label: string, file: File) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

const png = new File(["fake-bytes"], "ปก.png", { type: "image/png" });

describe("MediaUploadButton", () => {
  it("uploads the chosen file with its purpose and novel reference", async () => {
    uploadMedia.mockResolvedValue({ id: "m1", url: "http://api/media/novel_cover/x.png" });
    const onUploaded = vi.fn();

    render(
      <MediaUploadButton
        purpose="novel_cover"
        novel="my-novel"
        label="อัปโหลดปกนิยาย"
        onUploaded={onUploaded}
      />,
    );
    pickFile("อัปโหลดปกนิยาย", png);

    await waitFor(() =>
      expect(uploadMedia).toHaveBeenCalledWith({
        file: png,
        purpose: "novel_cover",
        novel: "my-novel",
      }),
    );
    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the size message on 413 and allows retrying", async () => {
    uploadMedia.mockRejectedValue(
      new ApiError(413, { code: "PAYLOAD_TOO_LARGE", message: "Too large." }),
    );

    render(
      <MediaUploadButton purpose="avatar" label="เพิ่มรูปโปรไฟล์" onUploaded={vi.fn()} />,
    );
    pickFile("เพิ่มรูปโปรไฟล์", png);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ไฟล์ใหญ่เกินไป"),
    );
    expect(
      screen.getByRole("button", { name: "เพิ่มรูปโปรไฟล์" }),
    ).not.toBeDisabled();
  });

  it("shows the type message on 422", async () => {
    uploadMedia.mockRejectedValue(
      new ApiError(422, { code: "VALIDATION_ERROR", message: "Validation failed." }),
    );

    render(
      <MediaUploadButton purpose="avatar" label="เพิ่มรูปโปรไฟล์" onUploaded={vi.fn()} />,
    );
    pickFile("เพิ่มรูปโปรไฟล์", png);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG หรือ WebP"),
    );
  });

  it("routes a guest to sign-in with the return path preserved", async () => {
    uploadMedia.mockRejectedValue(
      new ApiError(401, { code: "UNAUTHORIZED", message: "Authentication required." }),
    );

    render(
      <MediaUploadButton purpose="avatar" label="เพิ่มรูปโปรไฟล์" onUploaded={vi.fn()} />,
    );
    pickFile("เพิ่มรูปโปรไฟล์", png);

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(String(push.mock.calls[0][0])).toContain("/login?next=");
  });
});
