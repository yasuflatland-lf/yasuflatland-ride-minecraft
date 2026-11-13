import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { slotsFor } from "../../src/domain/vehicle/kinds/camper/decorPlacing";
import { DASHBOARD_SLOT_ITEMS } from "../../src/domain/vehicle/kinds/camper/furniture";
import { decorItemId } from "../support/decorIds";

type FitRow = {
  id: string;
  width: number;
  depth: number;
  dashboard_center: boolean;
  dashboard_left: boolean;
};
const table = () =>
  execFileSync("python3", ["-I", "tools/camper_decor_fit.py", "--json"], {
    encoding: "utf8",
  });

it("derives dashboard acceptance from deterministic clearance checks of the generated models", () => {
  const output = table();
  expect(table()).toBe(output);
  const rows: FitRow[] = JSON.parse(output);
  expect(rows.map((r) => r.id)).toEqual(
    JSON.parse(readFileSync("tools/camping_gear.json", "utf8")).map(
      (r: { id: string }) => r.id,
    ),
  );
  for (const slot of ["dashboard_center", "dashboard_left"] as const) {
    expect(DASHBOARD_SLOT_ITEMS[slot]).toEqual(
      rows.filter((r) => r[slot]).map((r) => r.id),
    );
    fc.assert(
      fc.property(fc.constantFrom(...rows), (row) => {
        const accepted = slotsFor(decorItemId(row.id)).some(
          (s) => s.id === slot,
        );
        expect(accepted).toBe(row[slot]);
        if (accepted) {
          expect(row.width).toBeLessThanOrEqual(7);
          expect(row.depth).toBeLessThanOrEqual(
            slot === "dashboard_center" ? 4.73 : 3.5,
          );
        }
      }),
    );
  }
  expect(rows.filter((r) => r.dashboard_center)).toHaveLength(15);
  expect(rows.filter((r) => r.dashboard_left)).toHaveLength(8);
  expect(rows.find((r) => r.id === "percolator")).toMatchObject({
    dashboard_left: true,
  });
  for (const id of [
    "macrame_planter",
    "fruit_bowl",
    "toaster",
    "cushion",
    "binoculars",
  ]) {
    expect(rows.find((r) => r.id === id)).toMatchObject({
      dashboard_center: false,
      dashboard_left: false,
    });
  }
});

it("detects box penetration across faces and rotated cubes while permitting contact and rejecting gaps in shelf support", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import sys
sys.path.insert(0, "tools")
import camper_decor_fit as f
box = f.cube_tilt.corners
base = box({"origin": [0, 0, 0], "size": [2, 2, 2]})
assert f.intersects(base, box({"origin": [.5, -1, .5], "size": [1, 4, 1]}))
assert not f.intersects(base, box({"origin": [2, 0, 0], "size": [1, 1, 1]}))
assert f.intersects(base, box({"origin": [1, 0, 0], "size": [2, 1, 1], "pivot": [1, 0, 0], "rotation": [0, 45, 0]}))
assert f.supported([0, 35, 0], [2, 36, 2], [([0, 34, 0], [1, 35, 2]), ([1, 34, 0], [2, 35, 2])])
assert not f.supported([0, 35, 0], [2, 36, 2], [([0, 34, 0], [.9, 35, 2]), ([1, 34, 0], [2, 35, 2])])
`,
  ]);
});
