import Link from "next/link";

/**
 * 404 page.
 *
 * docs/05 §28: an empty or missing state should point somewhere useful rather
 * than dead-ending. A guest who mistypes a fiction URL should land back in
 * discovery, not at a wall.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold">ไม่พบหน้านี้</h1>

      <p className="mt-4 text-text-secondary">
        หน้าที่คุณกำลังมองหาอาจถูกย้าย ลบ หรือไม่เคยมีอยู่
      </p>

      <div className="mt-8">
        <Link
          href="/"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          กลับสู่หน้าแรก
        </Link>
      </div>
    </main>
  );
}
