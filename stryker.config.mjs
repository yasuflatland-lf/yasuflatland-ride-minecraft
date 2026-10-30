export default {
  packageManager: "pnpm",
  // pnpm keeps the plugins out of core's own node_modules, where the default
  // "@stryker-mutator/*" glob looks for them.
  plugins: [
    "@stryker-mutator/typescript-checker",
    "@stryker-mutator/vitest-runner",
  ],
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  // main.ts and the in-game test pack's runner, arena and scenarios only wire
  // up @minecraft/server, which exists only inside the game, so no unit test
  // can kill their mutants (0010, 0048, 0088). protocol.ts and ramJudge.ts
  // have unit tests in tests/test-pack and stay mutated. The catalog is data,
  // checked against the scenario registry instead of mutation tested.
  mutate: [
    "src/**/*.ts",
    "!src/main.ts",
    "!src/test-pack/runner.ts",
    "!src/test-pack/arena.ts",
    "!src/test-pack/catalog.ts",
    "!src/test-pack/scenarios/**/*.ts",
  ],
  coverageAnalysis: "perTest",
  // The first run scored 69% (ADR 0048). A score far below that more likely
  // means the vitest runner patch stopped matching Vitest's test names and no
  // test ran for any mutant, which Stryker would otherwise report as success.
  thresholds: { high: 80, low: 60, break: 60 },
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
};
