import { ChatStatus } from "@/components/reader/chat-view";
import { renderWithSlots, type TokenSlot } from "@/components/reader/variable-text";
import { Icon } from "@/components/ui/icon";
import { derivedChatView } from "@/lib/prose-chat";

/**
 * อ่านแบบแชท - a prose chapter, laid out as a conversation
 * (docs/PHASE-13-CREATION-AND-CONTROL.md §13O).
 *
 * A Server Component, like every other reading surface: the derivation is pure
 * and runs during the render, so this ships no JavaScript (docs/07 §20).
 *
 * It looks like the chat view beside it but it is deliberately NOT the same
 * component, and the difference is honesty. A real chat chapter carries speaker
 * names and sides its author chose; this one has neither. Borrowing the bubble
 * with a speaker name invented for it would present a guess as the author's
 * work, so bubbles here have no name at all - and the panel at the top says
 * plainly that the layout is automatic and the prose is the original.
 */

export function DerivedChatView({
  content,
  slots = [],
}: {
  content: string;
  slots?: TokenSlot[];
}) {
  // Derived block by block from the manuscript's bare words (this view
  // renders plain text), with the author's structure kept: rules become
  // separators, heading lines become the grey scene markers.
  const turns = derivedChatView(content);

  return (
    <div className="reading-surface">
      <p className="mb-6 flex gap-2 rounded-lg border border-reader-rule px-4 py-3 text-[0.8em] text-reader-muted">
        <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
        <span>
          กำลังอ่านแบบแชท - ระบบแยกบทพูดจากเครื่องหมายคำพูดในต้นฉบับให้อัตโนมัติ
          ไม่ใช่การจัดวางของผู้เขียน และไม่ได้แก้ไขต้นฉบับ
        </span>
      </p>

      <ol className="flex flex-col gap-3 text-[0.85em]" aria-label="บทสนทนา">
        {turns.map((turn, index) => {
          switch (turn.kind) {
            case "separator":
              // The author's own --- rule, kept as the thin scene break a
              // chat reader recognises.
              return (
                <li key={index} aria-hidden className="my-1 flex items-center">
                  <span className="h-px w-full bg-reader-rule" />
                </li>
              );
            case "marker":
              // The standalone heading line - a character's name opening
              // their section - as the grey status pill, never a bubble.
              return (
                <li key={index}>
                  <ChatStatus text={turn.text}>
                    {renderWithSlots(turn.text, slots)}
                  </ChatStatus>
                </li>
              );
            case "narration":
              // What happened, in the grey action/status row a chat app
              // uses (reader review 2026-08) - visibly not speech.
              return (
                <li key={index}>
                  <ChatStatus text={turn.text}>
                    {renderWithSlots(turn.text, slots)}
                  </ChatStatus>
                </li>
              );
            default:
              return (
                <li
                  key={index}
                  className={`flex ${turn.side === "right" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl px-4 py-2 leading-relaxed whitespace-pre-wrap",
                      turn.side === "right"
                        ? "rounded-br-sm bg-primary text-white"
                        : "rounded-bl-sm bg-surface-secondary text-text",
                    ].join(" ")}
                  >
                    {renderWithSlots(turn.text, slots)}
                  </div>
                </li>
              );
          }
        })}
      </ol>
    </div>
  );
}
