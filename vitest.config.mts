import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Unit and component test configuration.
 *
 * Tooling per docs/15 §51: Vitest + React Testing Library. Playwright owns E2E
 * and is configured separately in playwright.config.ts, so the two never fight
 * over the same spec files - hence the explicit exclude below.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the `@/*` alias from tsconfig.json natively; no plugin needed.
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["lib/**", "types/**", "components/**"],
    },
  },
});
