import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountLexicon } from "@/features/ai/account-lexicon";
import { MutedRules } from "@/features/ai/muted-rules";
import { AiUsagePanel } from "@/features/ai/usage-panel";

/**
 * The account-level assistant panels (assistant-settings review §4-§6):
 * the account-wide word bank, the taught silences with a way back on, and
 * the daily quota stated before "ครบโควตา" is ever the first mention of it.
 */

const getUserLexicon = vi.fn();
const addUserLexiconTerm = vi.fn();
const removeUserLexiconTerm = vi.fn();
const listMutes = vi.fn();
const removeMute = vi.fn();
const getAiUsage = vi.fn();

vi.mock("@/lib/ai-client", () => ({
  getUserLexicon: (...a: unknown[]) => getUserLexicon(...a),
  addUserLexiconTerm: (...a: unknown[]) => addUserLexiconTerm(...a),
  removeUserLexiconTerm: (...a: unknown[]) => removeUserLexiconTerm(...a),
  listMutes: (...a: unknown[]) => listMutes(...a),
  removeMute: (...a: unknown[]) => removeMute(...a),
  getAiUsage: (...a: unknown[]) => getAiUsage(...a),
}));

afterEach(() => {
  getUserLexicon.mockReset();
  addUserLexiconTerm.mockReset();
  removeUserLexiconTerm.mockReset();
  listMutes.mockReset();
  removeMute.mockReset();
  getAiUsage.mockReset();
});

describe("AccountLexicon", () => {
  it("teaches a term once for every fiction", async () => {
    getUserLexicon.mockResolvedValue({ terms: [] });
    addUserLexiconTerm.mockResolvedValue({ terms: [{ id: "t1", term: "เทวาลัย" }] });
    render(<AccountLexicon />);

    await waitFor(() => expect(getUserLexicon).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("เพิ่มคำในคลังทั้งบัญชี"), {
      target: { value: "เทวาลัย" },
    });
    fireEvent.click(screen.getByRole("button", { name: "เพิ่ม" }));

    await waitFor(() => expect(addUserLexiconTerm).toHaveBeenCalledWith("เทวาลัย"));
    expect(screen.getByText("เทวาลัย")).toBeInTheDocument();
  });
});

describe("MutedRules", () => {
  it("lists every silence with its scope, and un-teaches one", async () => {
    listMutes.mockResolvedValue([
      { id: "m1", kind: "repetition", term: "มองมอง" },
      {
        id: "m2",
        kind: "spelling",
        term: "เทวาลัย",
        novel_id: "n1",
        novel_title: "เรื่องของฉัน",
        novel_slug: "my-novel",
      },
    ]);
    removeMute.mockResolvedValue(undefined);
    render(<MutedRules />);

    // A global mute says so; a scoped one names its fiction.
    await waitFor(() => expect(screen.getByText("ทุกเรื่อง")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "เรื่องของฉัน" })).toHaveAttribute(
      "href",
      "/studio/novels/my-novel",
    );

    fireEvent.click(screen.getAllByRole("button", { name: /เปิดเตือนอีกครั้ง/ })[0]);
    await waitFor(() => expect(removeMute).toHaveBeenCalledWith("m1"));
    expect(screen.queryByText("มองมอง")).not.toBeInTheDocument();
  });

  it("says out loud when nothing is muted", async () => {
    listMutes.mockResolvedValue([]);
    render(<MutedRules />);
    await waitFor(() =>
      expect(screen.getByText(/ยังไม่ได้ปิดกฎอะไรไว้/)).toBeInTheDocument(),
    );
  });
});

describe("AiUsagePanel", () => {
  it("shows the budget when the platform caps it", async () => {
    getAiUsage.mockResolvedValue({ limited: true, daily_quota: 10, used: 3, remaining: 7 });
    render(<AiUsagePanel />);
    await waitFor(() =>
      expect(screen.getByText(/ใช้ไป 3\/10 · เหลือ 7/)).toBeInTheDocument(),
    );
  });

  it("renders nothing at all when there is no cap", async () => {
    getAiUsage.mockResolvedValue({ limited: false, daily_quota: 0, used: 0, remaining: 0 });
    const { container } = render(<AiUsagePanel />);
    await waitFor(() => expect(getAiUsage).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
