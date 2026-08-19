import "server-only";

import { serverGetOne } from "@/lib/api-server";
import { env } from "@/lib/env";
import type { SubscriptionOverview } from "@/types/subscription";

/**
 * Whether the current viewer is entitled to no ads.
 *
 * A paying tier (premium/pro) is ad-free - the least a paid tier can mean once
 * ads exist. (When a dedicated ad-free entitlement key is registered in the
 * backend's registry, this reads `entitlements` instead of the tier.) The
 * check runs only when ads are enabled at all, so today it costs public pages
 * nothing. A failed lookup shows the slot: one placeholder glimpsed by a
 * paying user during an outage, never a permanently ad-free guest by mistake.
 */
export async function viewerAdFree(signedIn: boolean): Promise<boolean> {
  if (!env.adsEnabled || !signedIn) return false;
  try {
    const overview = await serverGetOne<SubscriptionOverview>("/subscription");
    return overview.tier === "premium" || overview.tier === "pro";
  } catch {
    return false;
  }
}
