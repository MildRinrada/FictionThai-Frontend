import { permanentRedirect } from "next/navigation";

/**
 * The assistant's settings moved into the account settings
 * (/settings/ai) - a settings page belongs with the other settings, not
 * floating under /studio (assistant-settings review, 2026-08). This stub
 * keeps every old link, bookmark, and footer reference working.
 */
export default function StudioAiRedirect() {
  permanentRedirect("/settings/ai");
}
