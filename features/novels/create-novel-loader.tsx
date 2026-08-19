"use client";

import dynamic from "next/dynamic";

/**
 * Loads the create form CLIENT-ONLY (13U).
 *
 * The form initialises itself from this device's memory - the autosaved
 * draft, the writer's last settings, their template - and server-rendering a
 * form whose real initial state lives in localStorage would guarantee a
 * hydration mismatch. There is nothing for a crawler here (the studio is
 * noindex), so SSR buys nothing and is switched off instead of worked around.
 */
const CreateNovelForm = dynamic(
  () =>
    import("@/features/novels/create-novel-form").then(
      (module) => module.CreateNovelForm,
    ),
  {
    ssr: false,
    loading: () => (
      <div aria-busy className="space-y-7">
        {[64, 96, 96, 128].map((height, index) => (
          <div
            key={index}
            style={{ height }}
            className="animate-pulse rounded-lg border border-border bg-surface-secondary/50"
          />
        ))}
      </div>
    ),
  },
);

export function CreateNovelLoader({
  username,
  hasDonationLink,
}: {
  username?: string;
  hasDonationLink?: boolean;
}) {
  return <CreateNovelForm username={username} hasDonationLink={hasDonationLink} />;
}
