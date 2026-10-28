import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const catalog = "item_catalog/crafting_item_catalog.json";
const committed = join("packs/yasu_ride_bp", catalog);
const run = (...args: string[]) =>
  execFileSync("python3", ["-I", "tools/gen_item_catalog.py", ...args], {
    encoding: "utf8",
  });
const runWithModule = (...lines: string[]) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import sys",
        "sys.path.insert(0, 'tools')",
        "import gen_item_catalog",
        ...lines,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );
const inTempDir = (body: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "item-catalog-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe("tools/gen_item_catalog.py (ADR 0093)", () => {
  it("passes --check on the committed catalog", () => {
    expect(run("packs/yasu_ride_bp", "--check")).toContain(
      "creative item catalog is up to date",
    );
  });

  it("writes the committed catalog into an empty behavior pack", () => {
    inTempDir((dir) => {
      run(dir);
      expect(readJson(join(dir, catalog))).toEqual(readJson(committed));
    });
  });

  it("fails --check on a stale catalog", () => {
    inTempDir((dir) => {
      const document = readJson(committed);
      document[
        "minecraft:crafting_items_catalog"
      ].categories[0].groups[0].items.pop();
      mkdirSync(join(dir, "item_catalog"), { recursive: true });
      writeFileSync(join(dir, catalog), JSON.stringify(document));
      expect(() => run(dir, "--check")).toThrow(
        /out of date with tools\/gen_item_catalog\.py/,
      );
    });
  });

  it("keeps the same group and item names apart across namespaces", () => {
    expect(
      runWithModule(
        'assert gen_item_catalog.validate([{"name": "a", "icon": "y", "items": ["y"]}, {"namespace": "other", "name": "a", "icon": "y", "items": ["y"]}]) is None',
      ),
    ).toBe("");
  });

  it("rejects duplicate groups and items, an empty group, and an icon outside its group", () => {
    const output = runWithModule(
      "try:",
      '    gen_item_catalog.validate([{"name": "a", "icon": "x", "items": ["y", "y"]}, {"name": "a", "icon": "z", "items": []}])',
      "except SystemExit as e:",
      "    print(str(e.code))",
    );
    expect(output).toContain("group yasu_ride:a is listed more than once");
    expect(output).toContain("a: has no items");
    expect(output).toContain("a: icon x is not one of its items");
    expect(output).toContain("yasu_ride:y is listed more than once");
    expect(
      runWithModule(
        "assert gen_item_catalog.validate(gen_item_catalog.GROUPS) is None",
      ),
    ).toBe("");
  });
});
