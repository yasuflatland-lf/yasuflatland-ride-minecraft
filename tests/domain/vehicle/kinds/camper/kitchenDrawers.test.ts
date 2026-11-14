import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import {
  StorageDoors,
  storageDoors,
  storageFurniture,
} from "../../../../../src/domain/vehicle/kinds/camper/dooredStorage";
import {
  CAMPER_STORAGE,
  DRAWER_COMPARTMENT,
  DRAWER_SPLIT_HEIGHT,
  drawerAtHeight,
  KITCHEN_DRAWERS,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { localCellAt } from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  CAMPER_SPEC,
  DRAWER_GEAR_IDS,
  DRAWER_INNER_HEIGHT_PX,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";
import {
  compartmentCells,
  storagePlateCells,
  storagePressTarget,
} from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";

const doors = storageDoors([KITCHEN_DRAWERS]);
const pose = { x: 0.5, y: 64, z: 0.5, yaw: 0 };
const catalogue: { id: string; hanging: boolean; height_px: number }[] =
  JSON.parse(readFileSync("tools/camping_gear.json", "utf8"));

it("lists exactly the standing catalogue gear no taller than the drawer interior", () => {
  expect(DRAWER_INNER_HEIGHT_PX).toBe(4.5);
  expect([...DRAWER_GEAR_IDS]).toEqual(
    catalogue
      .filter((g) => !g.hanging && g.height_px <= DRAWER_INNER_HEIGHT_PX)
      .map((g) => g.id),
  );
  expect(
    [...DRAWER_GEAR_IDS].every((id) => CAMPING_GEAR_IDS.includes(id)),
  ).toBe(true);
});

it("isolates the shared drawer cell and seam split from the model constants", () => {
  const source = readFileSync("tools/camper_kitchen_fronts.py", "utf8");
  const heights = source.match(
    /DRAWER_HEIGHTS = \{"drawer_bottom": ([\d.]+), "drawer_top": ([\d.]+)\}/,
  );
  expect(heights).not.toBeNull();
  const bottom = Number(heights?.[1]);
  const top = Number(heights?.[2]);
  expect(DRAWER_SPLIT_HEIGHT).toBeCloseTo(
    (bottom + 5.2 + (top - bottom - 5.2) / 2 - 16) / 16,
  );
  expect(source).toContain("[9, y, 16.45]");
  expect(DRAWER_COMPARTMENT).toEqual({
    x: -Math.round(9 / 16),
    z: -Math.round(16.45 / 16),
    layer: Math.floor(bottom / 16),
  });
  expect(CAMPER_STORAGE).not.toContain(KITCHEN_DRAWERS);
  expect(storageFurniture(KITCHEN_DRAWERS).cells).toEqual([DRAWER_COMPARTMENT]);
  expect(() => KITCHEN_DRAWERS.plateBlock({ face: 0, lit: false })).toThrow(
    "Sliding storage has no plate",
  );
  expect(doors.map((d) => [d.id, d.opening, d.slots.map((s) => s.id)])).toEqual(
    [
      ["drawer_top", { kind: "sliding" }, ["drawer_top_0"]],
      ["drawer_bottom", { kind: "sliding" }, ["drawer_bottom_0"]],
    ],
  );
});

it("routes every press height in either band to its drawer and leaves the counter top alone", () => {
  fc.assert(
    fc.property(
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(0, 90, 180, -90),
      (height, yaw) => {
        const p = { ...pose, yaw };
        const cell = localCellAt(p, DRAWER_COMPARTMENT);
        const expected =
          height >= 14 / 16
            ? undefined
            : height >= DRAWER_SPLIT_HEIGHT
              ? "drawer_top"
              : "drawer_bottom";
        expect(drawerAtHeight(height)).toBe(expected);
        expect(
          storagePressTarget(p, cell, doors, { ...cell, y: cell.y + height })
            ?.door.id,
        ).toBe(expected);
      },
    ),
  );
  expect(drawerAtHeight(DRAWER_SPLIT_HEIGHT)).toBe("drawer_top");
  expect(
    storagePressTarget(pose, localCellAt(pose, DRAWER_COMPARTMENT), doors),
  ).toBeUndefined();
});

it("lays one compartment for both openings and no plates", () => {
  fc.assert(
    fc.property(fc.subarray(["drawer_top", "drawer_bottom"]), (open) => {
      const shown = new Set(open);
      const cells = compartmentCells(pose, [], shown, doors);
      expect(cells).toHaveLength(1);
      expect(cells[0]?.block).toMatchObject({
        type: "drawers",
        topOpen: shown.has("drawer_top"),
        bottomOpen: shown.has("drawer_bottom"),
      });
      expect(storagePlateCells(pose, shown, false, doors)).toEqual([]);
    }),
  );
});

it("toggles independently with the existing opening-window debounce and shuts every drawer", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...doors),
      fc.integer({ min: 0, max: 20 }),
      (door, gap) => {
        const state = new StorageDoors(doors, () => 1, false);
        expect([...state.open()]).toEqual([]);
        expect(state.press(door.id, true, 0, () => undefined)).toEqual({
          kind: "door",
        });
        expect([...state.open()]).toEqual([door.id]);
        expect(state.press(door.id, true, gap, () => undefined)).toEqual(
          gap >= CAMPER_SPEC.doorSwingTicks ? { kind: "door" } : undefined,
        );
        state.shutAll();
        expect([...state.open()]).toEqual([]);
        expect([...state.shown()]).toEqual([]);
      },
    ),
  );
});
