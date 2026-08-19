import { renderWithSlots, type TokenSlot } from "@/components/reader/variable-text";
import type { ChatMessage } from "@/types/novel";

/**
 * Chat presentation (docs/01 §9.2, docs/06 §16).
 *
 * A Server Component: the conversation is static content, so it ships no
 * JavaScript (docs/07 §20). Message content is plain text and React escapes it
 * on render (docs/11 §17).
 *
 * The bubble side comes from the message's allowlisted metadata (docs/11 §18);
 * a message with no side defaults to the left, and speaker changes never
 * REASSIGN sides - the author's arrangement is presented, not reinterpreted.
 */

export interface ChatViewProps {
  messages: ChatMessage[];
  /** Reader-variable slots (§13H). A conversation names the reader too. */
  slots?: TokenSlot[];
}

export function ChatView({ messages, slots = [] }: ChatViewProps) {
  // The conversation sits inside the same reading measure as prose, so a chat
  // fiction is still a fiction on a page - the chat idiom stays inside the
  // reading area and never leaks into the navigation or the cards.
  return (
    <ol
      className="reading-surface flex flex-col gap-3 text-[0.85em]"
      aria-label="บทสนทนา"
    >
      {messages.map((message) => (
        <li key={message.id}>
          <ChatEntry message={message} slots={slots} />
        </li>
      ))}
    </ol>
  );
}

/**
 * The grey status row (reader review 2026-08): actions, narration, and scene
 * markers sit centred in the soft capsule a chat app uses for dates and
 * "x did y" statuses - visibly NOT anybody's bubble. A short status is a
 * pill; a long one keeps the shape but lets its lines breathe.
 */
export function ChatStatus({
  children,
  text = "",
}: {
  children: React.ReactNode;
  /** The plain text, when the caller has it - decides pill vs box. */
  text?: string;
}) {
  const short = [...text].length <= 80;
  return (
    <div className="flex justify-center">
      <span
        className={`max-w-[92%] bg-surface-secondary/70 text-[0.8em] leading-relaxed whitespace-pre-wrap text-reader-muted ${
          short ? "rounded-full px-4 py-1.5 text-center" : "rounded-xl px-4 py-2"
        }`}
      >
        {children}
      </span>
    </div>
  );
}

function ChatEntry({ message, slots }: { message: ChatMessage; slots: TokenSlot[] }) {
  if (message.message_type === "separator") {
    return (
      <div className="my-2 flex items-center gap-3 text-[0.8em] text-reader-muted">
        <span aria-hidden className="h-px flex-1 bg-reader-rule" />
        {message.content && (
          <span className="whitespace-pre-wrap">
            {renderWithSlots(message.content, slots)}
          </span>
        )}
        <span aria-hidden className="h-px flex-1 bg-reader-rule" />
      </div>
    );
  }

  if (message.message_type === "system") {
    return (
      <ChatStatus text={message.content}>
        {renderWithSlots(message.content, slots)}
      </ChatStatus>
    );
  }

  const right = message.metadata?.side === "right";
  return (
    <div className={`flex flex-col ${right ? "items-end" : "items-start"}`}>
      {/* The NAME substitutes too (chat-editor review item E): a speaker
          called (y/n) must read as the reader's own answer, exactly like the
          same token inside a bubble. */}
      <span className="mb-1 px-1 text-[0.75em] text-reader-muted">
        {renderWithSlots(message.speaker_name, slots)}
      </span>
      <div
        className={[
          "max-w-[85%] rounded-2xl px-4 py-2 leading-relaxed whitespace-pre-wrap",
          right
            ? "rounded-br-sm bg-primary text-white"
            : "rounded-bl-sm bg-surface-secondary text-text",
        ].join(" ")}
      >
        {renderWithSlots(message.content, slots)}
      </div>
    </div>
  );
}
