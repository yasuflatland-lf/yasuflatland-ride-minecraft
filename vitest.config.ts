import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // camperSurfaces veneer coordinates: main maximum 7.384 s (three runs); 4 x 7.384 = 29.536 s, rounded up to 30 s.
    testTimeout: 30_000,
    // afterAll closes a Python worker that may still be finishing a scooter build; a loaded CI runner took over 10 s.
    hookTimeout: 120_000,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/generatedSetup.ts"],
  },
});
