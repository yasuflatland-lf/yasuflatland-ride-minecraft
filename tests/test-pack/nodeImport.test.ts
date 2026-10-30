import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const modules = ["protocol", "features", "catalog", "plan", "lane"].filter(
  (name) => existsSync(new URL(`src/test-pack/${name}.ts`, root)),
);

it.each(modules)("loads %s with Node type stripping", (name) => {
  const module = new URL(`src/test-pack/${name}.ts`, root).href;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(module)})`],
    { cwd: fileURLToPath(root), encoding: "utf8", timeout: 10_000 },
  );
  expect(result.status, `${result.error ?? ""}\n${result.stderr}`).toBe(0);
});
