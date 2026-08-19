"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary. Must be a Client Component.
 *
 * docs/05 §30: an error state must say what happened, whether the user's data
 * is safe, and what they can do next. It must never show a stack trace
 * (docs/09 §39) - in production React replaces `error.message` with a digest,
 * and the real detail stays in the server logs.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Replace with a real error reporting service when one is chosen
    // (docs/14 §42). The digest is what correlates this with the server log.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold">เกิดข้อผิดพลาด</h1>

      <p className="mt-4 text-text-secondary">
        เราไม่สามารถโหลดหน้านี้ได้ในขณะนี้
      </p>
      {/* Reassurance is part of the contract: a writer must never be left
          wondering whether their work was lost (docs/05 §30). */}
      <p className="mt-2 text-text-secondary">
        ข้อมูลของคุณไม่ได้รับผลกระทบ
      </p>

      <div className="mt-8">
        <button
          type="button"
          onClick={retry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          ลองอีกครั้ง
        </button>
      </div>

      {error.digest ? (
        <p className="mt-8 text-xs text-text-muted">
          รหัสอ้างอิง: <code>{error.digest}</code>
        </p>
      ) : null}
    </main>
  );
}
