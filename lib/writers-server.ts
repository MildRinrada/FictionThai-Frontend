import "server-only";

import { serverGetOne } from "@/lib/api-server";
import type { WriterSpotlightView } from "@/types/profile";

/**
 * The week's writer ranking for the home band (docs/WRITER-SPOTLIGHT.md).
 *
 * Public and viewer-independent, so the response caches like every other home
 * shelf. Five minutes rather than sixty seconds: a ranking that reshuffles on
 * every reload reads as random, and the underlying metrics move slowly.
 *
 * `null` on ANY failure - the band simply does not render, and a broken
 * ranking must never break the front page (docs/05 §30).
 */
export async function fetchWriterSpotlight(): Promise<WriterSpotlightView | null> {
  try {
    const view = await serverGetOne<WriterSpotlightView>("/writers/spotlight", {
      authenticated: false,
      revalidate: 300,
    });
    return view?.writers ? view : null;
  } catch {
    return null;
  }
}
