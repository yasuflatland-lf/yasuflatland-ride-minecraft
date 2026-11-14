import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPER_FURNITURE } from "../../../src/domain/vehicle/kinds/camper/furniture";
import {
  DRAWER_GEAR_IDS,
  DRAWER_HIT_PROFILE,
  DRAWER_SLIDE_PX,
} from "../../../src/domain/vehicle/kinds/camper/spec";
import {
  bodyPoints,
  bone,
  bones,
  HANG_TOP,
  PLATE_UNDERSIDE,
  SHARED_KINDS,
  slotXZ,
  standingItems,
  turn,
} from "./helpers";

describe("camper furniture model (ADR 0093)", () => {
  it("puts every standing decor slot but the stove's on the model's top surface at its spot and runs the ceiling hook from the ceiling plate to the top of its cell (ADR 0093, 0099, 0102, 0108)", () => {
    // The stove's slot stands on its burner's grate, checked in the next test.
    const slots = CAMPER_FURNITURE.filter((f) => f.kind !== "stove").flatMap(
      (f) => f.slots,
    );
    expect(slots).toHaveLength(18);
    const unrotatedCubes = bones
      .filter((b) => b.rotation === undefined)
      .flatMap((b) => b.cubes ?? [])
      .filter((cube) => cube.rotation === undefined);
    for (const slot of slots) {
      const { x, z } = slotXZ(slot);
      const bottom = 16 * slot.cell.layer;
      if (slot.pair?.kind === "drawers") {
        const drawer = bone(slot.door ?? "");
        const floor = drawer.cubes?.find((cube) => cube.size[1] === 0.2);
        expect(floor, slot.id).toBeDefined();
        expect(
          (floor?.origin[1] ?? 0) + (floor?.size[1] ?? 0) - bottom,
        ).toBeCloseTo(slot.height, 6);
        expect((floor?.origin[0] ?? 0) + (floor?.size[0] ?? 0) / 2).toBeCloseTo(
          x + DRAWER_HIT_PROFILE.contentLeft - DRAWER_SLIDE_PX,
          6,
        );
        expect((floor?.origin[2] ?? 0) + (floor?.size[2] ?? 0) / 2).toBeCloseTo(
          z - DRAWER_HIT_PROFILE.contentAhead,
          6,
        );
        continue;
      }
      const covering = unrotatedCubes.filter((cube) => {
        const [ox = 0, , oz = 0] = cube.origin;
        const [sx = 0, , sz = 0] = cube.size;
        return ox <= x && x <= ox + sx && oz <= z && z <= oz + sz;
      });
      if (slot.hanging !== true) {
        // A cabinet compartment has its top panel and the ceiling over it, so only its
        // floor, in the lower half of the cell, counts (ADR 0114).
        const reach = slot.door === undefined ? 16 : 8;
        const tops = covering.flatMap((cube) => {
          const [, oy = 0] = cube.origin;
          const [, sy = 0] = cube.size;
          return oy < bottom + reach &&
            oy + sy > bottom &&
            oy + sy < bottom + reach
            ? [oy + sy]
            : [];
        });
        expect(tops.length, slot.id).toBeGreaterThan(0);
        expect(Math.ceil(Math.max(...tops) - bottom - 1e-9), slot.id).toBe(
          slot.height,
        );
      } else {
        const plate = covering.filter((cube) => {
          const [, oy = 0] = cube.origin;
          const [sx = 0, , sz = 0] = cube.size;
          return sx >= 16 && sz >= 16 && oy >= bottom;
        });
        expect(plate.length, slot.id).toBeGreaterThan(0);
        const underside = Math.min(
          ...plate.map((cube) => {
            const [, oy = 0] = cube.origin;
            return oy;
          }),
        );
        expect(Math.ceil(underside - bottom - 1e-9), slot.id).toBe(
          PLATE_UNDERSIDE,
        );
        const hook = covering.filter((cube) => {
          const [, oy = 0] = cube.origin;
          const [sx = 0, sy = 0] = cube.size;
          return sx < 16 && oy >= bottom && oy + sy <= underside + 1e-6;
        });
        expect(hook.length, slot.id).toBeGreaterThan(0);
        const cellTop = bottom + HANG_TOP;
        const spans = hook
          .map((cube) => {
            const [, oy = 0] = cube.origin;
            const [, sy = 0] = cube.size;
            return [oy, oy + sy] as const;
          })
          .sort((a, b) => a[0] - b[0]);
        for (const [lo] of spans) {
          expect(lo, slot.id).toBeGreaterThanOrEqual(cellTop - 1e-6);
        }
        expect(spans[0]?.[0], slot.id).toBeCloseTo(cellTop, 6);
        let reach = cellTop;
        for (const [lo, hi] of spans) {
          expect(lo, slot.id).toBeLessThanOrEqual(reach + 1e-6);
          reach = Math.max(reach, hi);
        }
        expect(reach, slot.id).toBeGreaterThanOrEqual(underside - 1e-6);
        expect(
          covering.some((cube) => {
            const [, oy = 0] = cube.origin;
            const [, sy = 0] = cube.size;
            return oy < cellTop - 0.001 && oy + sy > bottom + 0.001;
          }),
          slot.id,
        ).toBe(false);
      }
    }
  });

  it("hangs the wall cabinet from the ceiling down to y 50, over the counter window, with a floor and a top panel 9 px apart (ADR 0103, 0113, 0114)", () => {
    // The middle of the cell (-1, -1) the cabinet's sink compartment hangs in.
    const x = 16 * -1;
    const z = -16 * -1;
    const covering = (bones.find((b) => b.name === "body")?.cubes ?? [])
      .filter((cube) => cube.rotation === undefined)
      .filter((cube) => {
        const [ox = 0, , oz = 0] = cube.origin;
        const [sx = 0, , sz = 0] = cube.size;
        return ox <= x && x <= ox + sx && oz <= z && z <= oz + sz;
      })
      .map((cube) => {
        const [, oy = 0] = cube.origin;
        const [, sy = 0] = cube.size;
        return [oy, oy + sy] as const;
      });
    expect(covering).toContainEqual([50, 51]);
    expect(covering).toContainEqual([60, 61]);
    expect(covering.some(([lo, hi]) => lo < 60 && hi > 51)).toBe(false);
    expect(covering.some(([lo, hi]) => lo < 50 && hi > 32)).toBe(false);
  });

  it("stands the stove slot on top of the grate of its one burner in the cell middle (ADR 0107, 0112)", () => {
    const points = bodyPoints();
    const burners =
      CAMPER_FURNITURE.find((f) => f.kind === "stove")?.slots ?? [];
    expect(burners.map((s) => [s.id, s.spot ?? 0])).toEqual([["stove", 0]]);
    for (const slot of burners) {
      const { x, z } = slotXZ(slot);
      const bottom = 16 * slot.cell.layer;
      // The burner's grate and prongs, and nothing above the cell.
      const tops = points
        .filter(
          ([px = 0, py = 0, pz = 0]) =>
            Math.abs(px - x) < 2 &&
            Math.abs(pz - z) < 2 &&
            py > bottom &&
            py < bottom + 16,
        )
        .map(([, py = 0]) => py);
      expect(tops.length, slot.id).toBeGreaterThan(0);
      // The burner rises above the bare plate at 14 px, so the item cannot stand on the plate.
      expect(Math.max(...tops) - bottom, slot.id).toBeGreaterThan(14);
      expect(Math.ceil(Math.max(...tops) - bottom - 1e-9), slot.id).toBe(
        slot.height,
      );
    }
  });

  it("keeps every body cube, rotated ones included, out of every standing item on each stove, counter, fridge, table, and wall cabinet slot, and the two items on the table or in a storage compartment apart (ADR 0100, 0105, 0108, 0114, 0123)", () => {
    const points = bodyPoints();
    // Each standing item's box from its block model: half its width along the camper's left
    // (model x), half its depth forward (model z), and its height. The decor block turns the
    // model with the camper, so these axes hold in every facing.
    const items = standingItems();
    expect(items.length).toBeGreaterThan(0);
    const standing = CAMPER_FURNITURE.filter(
      (f) => SHARED_KINDS.includes(f.kind) || f.kind === "counter",
    ).flatMap((f) => f.slots);
    expect(standing).toHaveLength(14);
    // The table's or a storage compartment's two items stand apart for any two items (ADR
    // 0108, 0114, 0123).
    for (const [a, b] of [
      ["fridge_bottom_rear", "fridge_bottom_front"],
      ["fridge_top_rear", "fridge_top_front"],
      ["table", "table_aisle"],
      ["cabinet_sink_rear", "cabinet_sink_front"],
      ["cabinet_stove_rear", "cabinet_stove_front"],
    ]) {
      const one = standing.find((s) => s.id === a);
      const two = standing.find((s) => s.id === b);
      if (one === undefined || two === undefined) throw new Error(`${a} ${b}`);
      const p = slotXZ(one);
      const q = slotXZ(two);
      expect(16 * one.cell.layer + one.height).toBe(
        16 * two.cell.layer + two.height,
      );
      const touching = items.flatMap((i) =>
        items
          .filter(
            (j) =>
              Math.abs(p.x - q.x) < i.halfX + j.halfX - 1e-9 &&
              Math.abs(p.z - q.z) < i.halfZ + j.halfZ - 1e-9,
          )
          .map((j) => `${a} ${i.id} and ${b} ${j.id}`),
      );
      expect(touching).toEqual([]);
    }
    const halfX = Math.max(...items.map((i) => i.halfX));
    const halfZ = Math.max(...items.map((i) => i.halfZ));
    const height = Math.max(...items.map((i) => i.height));
    for (const slot of standing) {
      const center = slotXZ(slot);
      const sliding = slot.pair?.kind === "drawers";
      const x = center.x + (sliding ? DRAWER_HIT_PROFILE.contentLeft : 0);
      const z = center.z - (sliding ? DRAWER_HIT_PROFILE.contentAhead : 0);
      const top = 16 * slot.cell.layer + slot.height;
      // Narrowing to the points near the slot once keeps the per-item scans short; the run
      // with coverage in CI exceeded the 5 s test timeout scanning every point per item.
      const near = points.filter(
        ([px = 0, py = 0, pz = 0]) =>
          Math.abs(px - x) < halfX &&
          Math.abs(pz - z) < halfZ &&
          py > top + 1e-6 &&
          py < top + height,
      );
      for (const item of items.filter(
        (item) => slot.items === undefined || slot.items.includes(item.id),
      )) {
        const intruding = near.filter(
          ([px = 0, py = 0, pz = 0]) =>
            Math.abs(px - x) < item.halfX &&
            Math.abs(pz - z) < item.halfZ &&
            py > top + 1e-6 &&
            py < top + item.height,
        );
        expect(intruding, `${slot.id} ${item.id}`).toEqual([]);
      }
    }
  });

  it("fits each allowed drawer item above its closed floor between its walls", () => {
    const contents = JSON.parse(
      readFileSync(
        "packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json",
        "utf8",
      ),
    )["minecraft:geometry"][1].bones;
    const slots = CAMPER_FURNITURE.flatMap((f) => f.slots).filter(
      (s) => s.pair?.kind === "drawers",
    );
    expect(slots).toHaveLength(2);
    for (const slot of slots) {
      const drawer = bone(slot.door ?? "");
      const floor = drawer.cubes?.find((cube) => cube.size[1] === 0.2);
      if (!floor) throw new Error(`Missing floor for ${slot.id}`);
      const floorTop = (floor.origin[1] ?? 0) + (floor.size[1] ?? 0);
      const left = (floor.origin[0] ?? 0) + 0.2;
      const right = (floor.origin[0] ?? 0) + (floor.size[0] ?? 0);
      const rear = (floor.origin[2] ?? 0) + 0.2;
      const front = (floor.origin[2] ?? 0) + (floor.size[2] ?? 0) - 0.2;
      for (const item of DRAWER_GEAR_IDS) {
        const gear = contents.find(
          (b: { name: string }) => b.name === `${slot.door}_item_${item}`,
        );
        expect(gear, `${slot.id} ${item}`).toBeDefined();
        for (const cube of gear.cubes) {
          for (const [axis, low, high] of [
            [0, left, right],
            [1, floorTop, floorTop + 4.5],
            [2, rear, front],
          ] as const) {
            const coordinates = [0, 1].flatMap((i) =>
              [0, 1].flatMap((j) =>
                [0, 1].map((k) => {
                  const point = [i, j, k].map(
                    (n, a) => cube.origin[a] + n * cube.size[a],
                  );
                  const rotated = cube.rotation
                    ? turn(point, cube.pivot, cube.rotation)
                    : point;
                  return rotated[axis];
                }),
              ),
            );
            // Mug-pair rotated corners extend 0.006663 px below the source model base.
            expect(
              Math.min(...coordinates),
              `${slot.id} ${item} axis ${axis}`,
            ).toBeGreaterThanOrEqual(low - (axis === 1 ? 0.01 : 1e-6));
            expect(
              Math.max(...coordinates),
              `${slot.id} ${item} axis ${axis}`,
            ).toBeLessThanOrEqual(high + 1e-6);
          }
        }
      }
    }
  });

  it("keeps the aisle and the cell inside the entry door clear of the body's furniture", () => {
    for (const [low, high] of [
      [
        [-8, 16, -24],
        [8, 60.8, 55.5],
      ],
      [
        [-22.8, 16, -8],
        [-8, 60.8, 8],
      ],
    ] as const) {
      for (const cube of bone("body").cubes ?? []) {
        const overlaps = cube.origin.every(
          (start, axis) =>
            start < (high[axis] ?? 0) - 0.001 &&
            start + (cube.size[axis] ?? 0) > (low[axis] ?? 0) + 0.001,
        );
        expect(overlaps, `body: ${cube.origin}`).toBe(false);
      }
    }
  });

  it("hinges each wall cabinet door at the cabinet's outer end and swings it open into the aisle cell beside its compartment, under the ceiling (ADR 0114)", () => {
    for (const [name, pivotZ, angle, cellZ] of [
      ["cabinet_sink_door", 9, 90, [8, 24]],
      ["cabinet_stove_door", 39, -90, [24, 40]],
    ] as const) {
      const door = bone(name);
      expect(door.pivot).toEqual([-9.5, 0, pivotZ]);
      expect(door.parent).toBe("body");
      expect(door.cubes?.length).toBeGreaterThan(0);
      for (const cube of door.cubes ?? [])
        for (const corner of [0, 1].flatMap((i) =>
          [0, 1].flatMap((j) =>
            [0, 1].map((k) =>
              [i, j, k].map(
                (n, axis) =>
                  (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
              ),
            ),
          ),
        )) {
          const [cx = 0, cy = 0, cz = 0] = corner;
          // Shut, the door covers its compartment on the aisle face of the cabinet.
          expect(cx).toBeGreaterThanOrEqual(-10 - 1e-6);
          expect(cx).toBeLessThanOrEqual(-9.2 + 1e-6);
          expect(cz).toBeGreaterThanOrEqual(cellZ[0]);
          expect(cz).toBeLessThanOrEqual(cellZ[1]);
          expect(cy).toBeGreaterThanOrEqual(50);
          expect(cy).toBeLessThanOrEqual(61);
          // Open, it stands in the aisle cell, local x 0, beside its compartment.
          const [ox = 0, , oz = 0] = turn(corner, door.pivot, [0, angle, 0]);
          expect(ox, name).toBeGreaterThanOrEqual(-10 - 1e-6);
          expect(ox, name).toBeLessThanOrEqual(8);
          expect(oz, name).toBeGreaterThanOrEqual(cellZ[0]);
          expect(oz, name).toBeLessThanOrEqual(cellZ[1]);
        }
    }
  });
});
