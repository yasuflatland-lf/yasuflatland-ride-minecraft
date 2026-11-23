import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["@minecraft/server", "@minecraft/server-ui"],
  logLevel: "info",
};

export function bundleMain({ outfile, testHooks }) {
  return build({
    ...common,
    entryPoints: ["src/main.ts"],
    outfile,
    define: { __TEST_HOOKS__: String(testHooks) },
  });
}

if (import.meta.main) {
  execFileSync("python3", ["-I", "tools/run_generators.py", "--ensure"], {
    stdio: "inherit",
  });
  await bundleMain({
    outfile: "packs/yasu_ride_bp/scripts/main.js",
    testHooks: true,
  });
  await build({
    ...common,
    entryPoints: ["src/test-pack/runner.ts"],
    outfile: "packs/yasu_ride_test_bp/scripts/main.js",
    define: { __TEST_HOOKS__: "true" },
  });
}
