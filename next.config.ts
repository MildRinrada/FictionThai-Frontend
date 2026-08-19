import type { NextConfig } from "next";

/**
 * Baseline security headers for HTML responses.
 *
 * Content-Security-Policy is deliberately absent. docs/11 §44 warns against
 * copying a generic CSP: it must be designed around the actual frontend
 * architecture and tested against it. Next.js needs a nonce-based policy
 * (see `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`),
 * which is worth doing once real pages exist rather than guessing now.
 *
 * Strict-Transport-Security is likewise omitted: it belongs at the TLS
 * terminator, and docs/11 §45 says to enable HSTS only after validating the
 * deployment.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Send the origin cross-site but the full URL same-origin, so referrers do
  // not leak which fiction someone is reading to third parties (docs/11 §34).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Do not advertise the framework version to attackers scanning for known CVEs.
  poweredByHeader: false,

  // The floating "N" button Next's dev overlay pins to the viewport edge. It
  // confused user testing - an unexplained round button on every page - and
  // the overlay still opens on build errors without it.
  devIndicators: false,

  // Fail the production build on a type error rather than shipping it.
  // Next 16 no longer runs ESLint during `next build`, so linting is its own
  // step - `npm run lint`, and a required check in CI (docs/14 §35).
  typescript: { ignoreBuildErrors: false },

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
