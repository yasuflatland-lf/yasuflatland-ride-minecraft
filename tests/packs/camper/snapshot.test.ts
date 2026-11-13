import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bones } from "./helpers";

describe("camper rib atlas (ADR 0190)", () => {
  // Golden snapshot of generated cubes: regenerate deliberately for model changes; ribs and UVs never change cube origins or sizes (ADR 0190).
  it("keeps every cube's bone, origin, and size equal to the snapshot in tests/packs/fixtures/camper-cubes/", () => {
    const areas = JSON.parse(
      readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
    ) as Record<string, Record<string, number[] | number[][]>>;
    for (const [area, selections] of Object.entries(areas)) {
      const cubes = bones
        .filter((b) => !b.name.startsWith("glow_"))
        .flatMap((b) => {
          const selection = selections[b.name];
          if (!selection) return [];
          const ranges =
            typeof selection[0] === "number"
              ? [selection as number[]]
              : (selection as number[][]);
          return (b.cubes ?? []).flatMap((cube, index) =>
            ranges.some(
              ([first = 0, last = -1]) => index >= first && index <= last,
            )
              ? [[b.name, cube.origin, cube.size]]
              : [],
          );
        });
      const path = `tests/packs/fixtures/camper-cubes/${area}.json`;
      if (process.env.CAMPER_SNAPSHOT_UPDATE === "1") {
        writeFileSync(
          path,
          `[\n${cubes.map((cube) => `  ${JSON.stringify(cube).replaceAll(",", ", ")}`).join(",\n")}\n]\n`,
        );
      } else {
        expect(cubes, area).toEqual(JSON.parse(readFileSync(path, "utf8")));
      }
    }
  });
});
