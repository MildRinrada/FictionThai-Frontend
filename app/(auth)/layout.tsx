import type { ReactNode } from "react";

/**
 * Layout for the authentication pages.
 *
 * A route group `(auth)` - it shares this chrome without adding a URL segment,
 * so the routes stay /login and /register as specified in docs/03.
 *
 * The wordmark lives in the application shell now, so this layout only centres
 * the form. Keeping the shell here is deliberate: someone who lands on sign-in
 * can still leave and go on reading (docs/10 §2.1).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-16">
      {children}
    </main>
  );
}
