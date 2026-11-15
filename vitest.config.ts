import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Python-backed tests: 7.4 s slowest default-reliant test on PR #1738; 4x rounded up to 30 s (docs/specs/testing-and-ci.md).
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/generatedSetup.ts"],
  },
});
