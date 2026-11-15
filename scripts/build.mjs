import { execFileSync } from "node:child_process";
import { build } from "esbuild";

execFileSync("python3", ["-I", "tools/run_generators.py", "--ensure"], {
  stdio: "inherit",
});

const common = {
  bundle: true,
  format: "esm",
  target: "es2022",
  external: ["@minecraft/server", "@minecraft/server-ui"],
  logLevel: "info",
};
await build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "packs/yasu_ride_bp/scripts/main.js",
});
await build({
  ...common,
  entryPoints: ["src/test-pack/runner.ts"],
  outfile: "packs/yasu_ride_test_bp/scripts/main.js",
});
