import { Icon } from "@/components/ui/icon";
import type { SaveState } from "@/lib/use-autosave";

/**
 * A settings block's own answer to "did that save?" - sits beside the block
 * heading (settings review 2026-08, item A). Idle renders nothing: a page of
 * eight blocks all announcing "บันทึกแล้ว" on arrival would say less than
 * silence does.
 */
export function SaveBadge({
  state,
  error,
}: {
  state: SaveState;
  error?: string | null;
}) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span role="status" className="text-xs text-text-muted">
        กำลังบันทึก…
      </span>
    );
  }
  if (state === "error") {
    return (
      <span role="alert" className="text-xs text-error">
        {error ?? "บันทึกไม่สำเร็จ"}
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1 text-xs text-success">
      <Icon name="check" size={13} />
      บันทึกแล้ว
    </span>
  );
}
