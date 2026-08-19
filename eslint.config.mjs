import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The exported Claude Design prototype. It is a design reference, not
    // source: it ships its own bundled runtime and is never built or imported
    // by the app, so linting it only reports on generated code.
    "Design direction questions/**",
  ]),
]);

export default eslintConfig;
