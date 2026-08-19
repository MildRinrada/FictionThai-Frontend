import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests so a leftover DOM cannot make the next test pass for
// the wrong reason.
afterEach(() => {
  cleanup();
});
