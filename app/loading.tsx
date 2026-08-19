/**
 * Route-level loading state.
 *
 * docs/05 §29: use skeletons for content-heavy pages rather than a whole-app
 * "Loading…", because a skeleton makes the application feel faster and keeps
 * the layout stable.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16" aria-busy="true">
      {/* Screen readers get a real announcement; the skeleton below is
          decorative and hidden from them. */}
      <span className="sr-only" role="status">
        กำลังโหลด
      </span>

      <div aria-hidden="true" className="animate-pulse space-y-8">
        <div className="space-y-3">
          <div className="h-9 w-56 rounded-md bg-surface-secondary" />
          <div className="h-5 w-80 max-w-full rounded-md bg-surface-secondary" />
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <div className="h-6 w-40 rounded-md bg-surface-secondary" />
          <div className="mt-4 h-5 w-64 max-w-full rounded-md bg-surface-secondary" />
        </div>

        <div className="space-y-3">
          <div className="h-6 w-44 rounded-md bg-surface-secondary" />
          <div className="h-4 w-full rounded-md bg-surface-secondary" />
          <div className="h-4 w-5/6 rounded-md bg-surface-secondary" />
        </div>
      </div>
    </main>
  );
}
