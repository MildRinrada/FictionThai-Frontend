import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CoverEditor } from "@/features/studio/cover-editor";
import { NovelSettings } from "@/features/studio/novel-settings";
import { VariableTable } from "@/features/studio/variable-table";
import type { Novel } from "@/types/novel";

/**
 * The settings-page review's structural rules (2026-08):
 *
 *   - ONE visibility control: the ladder. The เผยแพร่/ส่วนตัว toggle that
 *     duplicated it is gone, and so are the six save buttons - the page
 *     autosaves (asserted through the absence of submits);
 *   - the format section asks TWO questions, not three: the content-mode
 *     column that duplicated "Headcanon ล้วน" no longer exists;
 *   - จบในตอนเดียว is disabled, with the reason stated, while several
 *     chapters exist;
 *   - the undeclared-token warning fixes itself in one press, and a token
 *     matching a CHARACTER's name is set apart instead of offered as a
 *     reader variable.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/novels-client", () => ({
  updateNovel: vi.fn().mockResolvedValue({}),
  updateNovelFormat: vi.fn().mockResolvedValue({ needs_chat_setup: false }),
  saveVariables: vi.fn().mockResolvedValue({
    variables: [],
    usage: { undeclared: [], unused: [] },
  }),
  listNovels: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("@/lib/discovery-client", () => ({
  getGenres: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
}));
vi.mock("@/lib/suggest-client", () => ({
  suggest: vi.fn().mockResolvedValue({ own: [], novels: [], authors: [], tags: [] }),
}));

function novel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: "n1",
    slug: "my-fic",
    title: "เรื่องของฉัน",
    tagline: "",
    description: "",
    status: "ongoing",
    visibility: "private",
    age_rating: "general",
    age_gate: "confirm",
    origin_type: "original",
    story_structure: "multi_chapter",
    presentation_format: "standard",
    content_mode: "general",
    comment_access: "members",
    comment_approval: false,
    genres: [],
    tags: [],
    is_owner: true,
    author: { id: "a1", username: "someone" },
    rights: {
      allow_screenshot: true,
      allow_translation: false,
      allow_derivative: false,
      allow_audio: false,
      require_credit: true,
    },
    ...overrides,
  } as Novel;
}

describe("NovelSettings (review round: one control per fact)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has no duplicate visibility toggle and no save buttons - the page autosaves", () => {
    render(<NovelSettings novel={novel()} chapterTotal={1} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("เผยแพร่หรือส่วนตัว")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /บันทึก/ }),
    ).not.toBeInTheDocument();
    // The ladder remains - the ONE control.
    expect(screen.getByText("ใครเห็นเรื่องนี้ได้")).toBeInTheDocument();
  });

  it("asks the format question twice, not three times", () => {
    render(<NovelSettings novel={novel()} chapterTotal={1} />);
    expect(screen.queryByText("ประเภทเนื้อหา")).not.toBeInTheDocument();
    expect(screen.queryByText("งานเฮดแคนอน")).not.toBeInTheDocument();
    expect(screen.getByText("Headcanon ล้วน")).toBeInTheDocument();
  });

  it("disables จบในตอนเดียว while several chapters exist, and says why", () => {
    render(<NovelSettings novel={novel()} chapterTotal={8} />);
    expect(screen.getByRole("radio", { name: "จบในตอนเดียว" })).toBeDisabled();
    expect(screen.getByText(/เรื่องนี้มี 8 ตอนแล้ว/)).toBeInTheDocument();
  });

  it("leaves จบในตอนเดียว selectable for a work that has that shape", () => {
    render(<NovelSettings novel={novel()} chapterTotal={1} />);
    expect(screen.getByRole("radio", { name: "จบในตอนเดียว" })).toBeEnabled();
  });

  it("calls the fanfic origin by the create form's word, with the same fandom field", () => {
    // Parity review 2026-08: one concept, one name. The card said จากต้นฉบับ
    // here and แฟนฟิค at creation - the same question looked like two.
    render(
      <NovelSettings
        novel={novel({ origin_type: "fanfiction", fandom: "Genshin Impact" })}
        chapterTotal={1}
      />,
    );
    expect(screen.getByRole("radio", { name: /แฟนฟิค/ })).toBeInTheDocument();
    expect(screen.queryByText("จากต้นฉบับ")).not.toBeInTheDocument();
    expect(
      screen.getByText("เขียนจากเรื่องอะไร (เรื่องต้นทาง)"),
    ).toBeInTheDocument();
  });
});

describe("VariableTable (review round: the warning fixes itself)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adopts every found token in one press, preset questions included", () => {
    render(
      <VariableTable
        novelRef="my-fic"
        initial={[]}
        initialUsage={{ undeclared: ["(y/n)", "(e/c)"], unused: [] }}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "เพิ่มตัวแปรที่พบทั้งหมด (2)" }),
    );
    // The preset's own question arrives with its token - nothing to retype.
    // Rows show the KEY alone - the brackets are the platform's convention.
    expect(screen.getByDisplayValue("y/n")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ชื่อของคุณ")).toBeInTheDocument();
    expect(screen.getByDisplayValue("e/c")).toBeInTheDocument();
  });

  it("sets a token matching a character's name apart - two names for one person is not a reader variable", () => {
    // The split arrives FROM THE SERVER (character_mentions), which compared
    // the token against the fiction's declared cast - the client never
    // guesses from the token's shape.
    render(
      <VariableTable
        novelRef="my-fic"
        initial={[]}
        initialUsage={{
          undeclared: ["(y/n)"],
          character_mentions: ["(Scaramouche/Wanderer)"],
          unused: [],
        }}
      />,
    );
    // The adopt-all button counts only the real candidate.
    expect(
      screen.getByRole("button", { name: "เพิ่มตัวแปรที่พบทั้งหมด (1)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ตรงกับชื่อตัวละครของเรื่อง/)).toBeInTheDocument();
    // Deliberate adoption stays possible - the writer outranks the heuristic.
    expect(
      screen.getByRole("button", { name: "+ (Scaramouche/Wanderer)" }),
    ).toBeInTheDocument();
  });

  it("labels the presets with what they mean, not just codes", () => {
    render(
      <VariableTable
        novelRef="my-fic"
        initial={[]}
        initialUsage={{ undeclared: [], unused: [] }}
      />,
    );
    // "l/n" alone was a code; the button now carries the answer - and shows
    // the KEY without the platform's brackets.
    expect(screen.getByRole("button", { name: /l\/n.*นามสกุล/ })).toBeInTheDocument();
  });
});

describe("CoverEditor (cover review: one editing home)", () => {
  it("links an existing cover to the settings block instead of a second modal", () => {
    render(
      <CoverEditor
        novelRef="my-fic"
        coverURL="https://media.example/cover.png"
        editHref="/studio/novels/my-fic/settings#identity"
      />,
    );
    expect(
      screen.getByRole("link", { name: "เปลี่ยนปกในตั้งค่าเรื่อง" }),
    ).toHaveAttribute("href", "/studio/novels/my-fic/settings#identity");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the dialog in place while there is no cover - filling in, not editing", () => {
    render(
      <CoverEditor
        novelRef="my-fic"
        coverURL={null}
        editHref="/studio/novels/my-fic/settings#identity"
      />,
    );
    // The empty frame is an invitation, and it acts right here.
    expect(screen.getByRole("button", { name: "เพิ่มปกเรื่อง" })).toBeInTheDocument();
    expect(screen.getByText("เพิ่มปก")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the direct dialog on the settings page itself - no editHref, no loop", () => {
    render(
      <CoverEditor novelRef="my-fic" coverURL="https://media.example/cover.png" />,
    );
    expect(screen.getByRole("button", { name: "เปลี่ยนปกเรื่อง" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
