import type { Dimension } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import { seatExitSpot } from "../../../../src/infrastructure/vehicle/bedrock/seatExitSpot";

const GROUND_TOP = 64;

interface Cell {
  type: string;
  height?: number;
}

/** Stone up to row 63 and air above, with `cells` set by "x,y,z" key. */
function world(cells: Record<string, Cell> = {}): Dimension {
  return {
    getBlock: ({ x, y, z }: Vec3) => {
      const cell = cells[`${x},${y},${z}`] ?? {
        type: y < GROUND_TOP ? "stone" : "air",
      };
      const typeId = `minecraft:${cell.type}`;
      return {
        typeId,
        isAir: cell.type === "air",
        isLiquid: cell.type === "water" || cell.type === "lava",
        permutation: { getState: () => cell.height },
      };
    },
  } as unknown as Dimension;
}

const exitPoint = fc.record({
  x: fc.double({ min: -50, max: 50, noNaN: true }),
  y: fc.constant(GROUND_TOP),
  z: fc.double({ min: -50, max: 50, noNaN: true }),
});

describe("seatExitSpot", () => {
  it("keeps the exit on open ground", () => {
    fc.assert(
      fc.property(exitPoint, (at) => {
        expect(seatExitSpot(world(), at)).toEqual(at);
      }),
    );
  });

  it("refuses an exit whose player box overlaps a wall in any column, at the feet or the head", () => {
    fc.assert(
      fc.property(
        exitPoint,
        fc.constantFrom(-0.29, 0.29),
        fc.constantFrom(-0.29, 0.29),
        fc.constantFrom(0, 1),
        (at, dx, dz, dy) => {
          const wall = `${Math.floor(at.x + dx)},${GROUND_TOP + dy},${Math.floor(at.z + dz)}`;
          expect(
            seatExitSpot(world({ [wall]: { type: "stone" } }), at),
          ).toBeUndefined();
        },
      ),
    );
  });

  it.each([
    { type: "short_grass" },
    { type: "dandelion" },
    { type: "white_carpet" },
    { type: "light_block_15" },
    { type: "snow_layer", height: 3 },
  ])("stands the player in $type at the feet", (cell) => {
    const at = { x: 3.5, y: GROUND_TOP, z: 3.5 };
    expect(seatExitSpot(world({ "3,64,3": cell }), at)).toEqual(at);
  });

  it.each([
    { type: "water" },
    { type: "sweet_berry_bush" },
    { type: "snow_layer", height: 4 },
  ])("keeps the engine's spot with $type at the feet", (cell) => {
    const at = { x: 3.5, y: GROUND_TOP, z: 3.5 };
    expect(seatExitSpot(world({ "3,64,3": cell }), at)).toBeUndefined();
  });

  it.each(["air", "water", "lava", "short_grass"])(
    "keeps the engine's spot over %s, as at a ledge or a shore",
    (type) => {
      const at = { x: 3.5, y: GROUND_TOP, z: 3.5 };
      expect(seatExitSpot(world({ "3,63,3": { type } }), at)).toBeUndefined();
    },
  );

  it("stands the player on top of ground lower than a full block that the tracks stand in", () => {
    const at = { x: 3.5, y: GROUND_TOP - 1 / 16, z: 3.5 };
    expect(
      seatExitSpot(world({ "3,63,3": { type: "grass_path" } }), at),
    ).toEqual({ ...at, y: GROUND_TOP });
  });

  it("keeps the engine's spot when a full block fills the floor row under a vehicle standing low in it", () => {
    const at = { x: 3.5, y: GROUND_TOP - 0.75, z: 3.5 };
    expect(
      seatExitSpot(world({ "3,63,3": { type: "stone" } }), at),
    ).toBeUndefined();
  });
});
