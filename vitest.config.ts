import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // camperSurfaces veneer coordinates: main maximum 7.384 s (three runs); 4 x 7.384 = 29.536 s, rounded up to 30 s.
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/generatedSetup.ts"],
  },
});
