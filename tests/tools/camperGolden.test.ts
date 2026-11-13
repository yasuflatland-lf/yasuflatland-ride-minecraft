import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const cube = {
  origin: [0, 0, 0],
  size: [1, 1, 1],
  uv: { north: { uv: [0, 0], uv_size: [1, 1] } },
};
type Change =
  | "none"
  | "counts"
  | "origin"
  | "size"
  | "extra"
  | "deleted"
  | "labels";

describe("camper golden comparison", () => {
  it("returns zero for matching counts and region sizes and origins", () =>
    compare("none"));
  it.each(["counts", "origin", "size", "extra"] as const)(
    "returns one with a diff for changed %s",
    (change) => compare(change),
  );
  it("restricts comparison to the selected area and its used regions", () =>
    compare("counts", "cab"));
  it("ignores regions used only outside the selected area", () =>
    compare("extra", "cab"));
  it("includes shared region placement changes in the selected area", () =>
    compare("origin", "cab"));
  it("does not count deleted cubes from stale ownership ranges", () =>
    compare("deleted", "shell"));
  it("reports missing-side labels when module and spike area names differ", () =>
    compare("labels", "cab"));
  it("reports an unknown area instead of accepting an empty comparison", () =>
    compare("none", "missing"));
});

function compare(change: Change, area?: string) {
  const directory = mkdtempSync(join(tmpdir(), "camper-golden-"));
  try {
    cpSync("tools", join(directory, "tools"), { recursive: true });
    // This comparison fixture has one base region, independent of production upholstery.
    writeFileSync(
      join(directory, "tools/camper_kit.py"),
      `from tool_loader import load_tool
regions = load_tool("camper_regions")
REGISTRY = regions.RegionRegistry()
REGISTRY.register(regions.Region("base", 114, 220, regions.Material.SWATCHES_MIXED, lambda x,y: (0,0,0,255)))
LAYOUT = regions.pack(REGISTRY)
`,
    );
    const models = join(
      directory,
      "packs/yasu_ride_rp/models/entity/yasu_ride",
    );
    const fixtures = join(directory, "tests/packs/fixtures");
    const golden = join(directory, "golden");
    for (const path of [models, fixtures, golden])
      mkdirSync(path, { recursive: true });
    writeFileSync(
      join(models, "camper.geo.json"),
      JSON.stringify({
        "minecraft:geometry": [
          {
            bones: [
              { name: "body", cubes: change === "deleted" ? [] : [cube] },
              { name: "steering", cubes: [cube] },
            ],
          },
        ],
      }),
    );
    writeFileSync(
      join(fixtures, "camper-areas.json"),
      JSON.stringify({ shell: { body: [0, 0] }, cab: { steering: [0, 0] } }),
    );
    writeFileSync(
      join(golden, "final-model.json.gz"),
      gzipSync(
        JSON.stringify({
          bones: [
            {
              name: "body",
              cubes: Array.from(
                { length: change === "counts" ? 2 : 1 },
                () => ({ ...cube, _area: "shell" }),
              ),
            },
            {
              name: "steering",
              cubes: [
                {
                  ...cube,
                  _area:
                    change === "labels" ? "cab dash and instruments" : "cab",
                },
              ],
            },
          ],
        }),
      ),
    );
    writeFileSync(
      join(golden, "final-regions.json"),
      JSON.stringify([
        {
          name: "base including borrowed patch",
          source: "base",
          size: [114, change === "size" ? 221 : 220],
          origin: [20, 30],
          packed_origin: change === "origin" ? [1, 0] : [0, 0],
          used_by: {
            shell: 6,
            [change === "labels" ? "cab dash and instruments" : "cab"]: 6,
          },
        },
        ...(change === "extra"
          ? [
              {
                name: "extra",
                size: [1, 1],
                packed_origin: [4, 4],
                used_by: { shell: 1 },
              },
            ]
          : []),
      ]),
    );
    const result = spawnSync(
      "python3",
      [
        "-I",
        join(directory, "tools/camper_golden.py"),
        "compare",
        "--golden-dir",
        golden,
        ...(area ? ["--area", area] : []),
      ],
      { encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe("");
    if (area === "missing") {
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Unknown area: missing");
    } else if (
      change !== "none" &&
      !(area === "cab" && ["counts", "extra"].includes(change))
    ) {
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        change === "counts" || change === "deleted"
          ? "body"
          : change === "labels"
            ? "steering"
            : change === "extra"
              ? "extra"
              : "base",
      );
      expect(result.stdout).toContain("--- golden");
      expect(result.stdout).toContain("+++ current");
    } else {
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("match");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
