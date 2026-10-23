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

describe("tools/gen_item_catalog.py (ADR 0093)", () => {
  it("passes --check on the committed catalog", () => {
    expect(run("packs/yasu_ride_bp", "--check")).toContain(
      "creative item catalog is up to date",
    );
  });

  it("writes the committed catalog into an empty behavior pack", () => {
    const dir = mkdtempSync(join(tmpdir(), "item-catalog-"));
    try {
      run(dir);
      expect(readJson(join(dir, catalog))).toEqual(readJson(committed));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails --check on a stale catalog", () => {
    const dir = mkdtempSync(join(tmpdir(), "item-catalog-"));
    try {
      const document = readJson(committed);
      document[
        "minecraft:crafting_items_catalog"
      ].categories[0].groups[0].items.pop();
      mkdirSync(join(dir, "item_catalog"), { recursive: true });
      writeFileSync(join(dir, catalog), JSON.stringify(document));
      expect(() => run(dir, "--check")).toThrow(
        /out of date with tools\/gen_item_catalog\.py/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate groups and items, an empty group, and an icon outside its group", () => {
    const imports = [
      "import sys",
      "sys.path.insert(0, 'tools')",
      "import gen_item_catalog",
    ];
    const script = [
      ...imports,
      "try:",
      '    gen_item_catalog.validate([{"name": "a", "icon": "x", "items": ["y", "y"]}, {"name": "a", "icon": "z", "items": []}])',
      "except SystemExit as e:",
      "    print(str(e.code))",
    ].join("\n");
    const output = execFileSync("python3", ["-I", "-c", script], {
      encoding: "utf8",
    });
    expect(output).toContain("group a is listed more than once");
    expect(output).toContain("a: has no items");
    expect(output).toContain("a: icon x is not one of its items");
    expect(output).toContain("y is listed more than once");
    expect(
      execFileSync(
        "python3",
        [
          "-I",
          "-c",
          [
            ...imports,
            "assert gen_item_catalog.validate(gen_item_catalog.GROUPS) is None",
          ].join("\n"),
        ],
        { encoding: "utf8" },
      ),
    ).toBe("");
  });
});
