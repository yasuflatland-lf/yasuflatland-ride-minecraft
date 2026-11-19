import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Mug pair on main: 7.209, 4.857 and 4.168 s. Four times the maximum rounds up to 29 s.
    testTimeout: 29_000,
    // Camper dash hook bounds on main: 5.028, 2.227 and 3.601 s. Four times the maximum rounds up to 21 s.
    hookTimeout: 21_000,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/support/generatedSetup.ts"],
  },
});
