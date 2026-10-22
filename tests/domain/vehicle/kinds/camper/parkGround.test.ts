// Parking over natural ground and grassland plants (ADR 0119).
import fc from "fast-check";
import { expect, it } from "vitest";
import {
  AIR,
  CLEARABLE_DECORATIONS,
  exitCells,
  isPassable,
  NATURAL_GROUND,
  parkCheckCells,
  parkGround,
  parkPose,
  planPark,
  roomCells,
  wallFootCells,
} from "../../../../../src/domain/vehicle/kinds/camper/room";
import { cellKey } from "../../../../../src/domain/vehicle/lighting/headlights";
import { defined } from "../../../../support/defined";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
const location = fc.record({
  x: coordinate,
  z: coordinate,
  y: fc.integer({ min: -64, max: 300 }),
});
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const pose = fc.tuple(location, yaw).map(([at, angle]) => parkPose(at, angle));
const ground = fc.constantFrom(...NATURAL_GROUND);
const plantOrAir = fc.constantFrom(AIR, ...CLEARABLE_DECORATIONS);
// Floor cells, the door step and the exit's feet (ADR 0119).
const GROUND_CELLS = 23;

it("lets ground rise only in the floor, the door step and the exit's feet, and clears plants only in the bumper's row", () => {
  fc.assert(
    fc.property(pose, (p) => {
      const { ground: spots, bumper } = parkGround(p);
      expect(spots.size).toBe(GROUND_CELLS);
      const checked = new Map(parkCheckCells(p).map((c) => [cellKey(c), c]));
      for (const key of spots)
        expect(defined(checked.get(key), key).y).toBe(p.y);
      const room = roomCells(p, false).filter((c) => spots.has(cellKey(c)));
      expect(
        room.every((c) => c.block.type === "floor" || c.block.type === "deck"),
      ).toBe(true);
      expect(spots.has(cellKey(defined(exitCells(p)[0], "exit feet")))).toBe(
        true,
      );
      expect(spots.has(cellKey(defined(exitCells(p)[1], "exit head")))).toBe(
        false,
      );
      const feet = new Set(wallFootCells(p).map(cellKey));
      expect(bumper.size).toBe(3);
      for (const key of bumper) expect(feet.has(key)).toBe(true);
    }),
  );
});

it("parks over natural ground in any ground cell, leaving it in place, and refuses it anywhere else", () => {
  fc.assert(
    fc.property(
      pose,
      fc.array(plantOrAir, { minLength: 168, maxLength: 168 }),
      fc.array(fc.tuple(fc.nat(), ground), { minLength: 1, maxLength: 23 }),
      fc.nat(),
      ground,
      (p, base, raised, elsewhere, blocking) => {
        const cells = parkCheckCells(p);
        const spots = parkGround(p);
        const groundIndices = cells.flatMap((c, i) =>
          spots.ground.has(cellKey(c)) ? [i] : [],
        );
        const types: string[] = [...base];
        for (const [pick, block] of raised)
          types[defined(groundIndices[pick % groundIndices.length], "i")] =
            block;
        const clear = defined(
          planPark(cells, types, [], [], spots),
          "parks over ground",
        );
        const withoutGround = types.map((t) =>
          NATURAL_GROUND.has(t) ? AIR : t,
        );
        expect(clear).toEqual(planPark(cells, withoutGround));
        for (const c of clear) expect(NATURAL_GROUND.has(c.typeId)).toBe(false);
        const others = cells.flatMap((c, i) =>
          spots.ground.has(cellKey(c)) ? [] : [i],
        );
        const bad = [...types];
        bad[defined(others[elsewhere % others.length], "other")] = blocking;
        expect(planPark(cells, bad, [], [], spots)).toBeUndefined();
        // Without the ground rule every ground block refuses, as before ADR 0119.
        expect(planPark(cells, types)).toBeUndefined();
      },
    ),
  );
});

it("clears a plant in the bumper's row even without an upper half, and leaves other wall feet alone", () => {
  fc.assert(
    fc.property(
      pose,
      fc.nat(),
      fc.constantFrom(...CLEARABLE_DECORATIONS),
      (p, pick, plant) => {
        const cells = parkCheckCells(p);
        const feet = wallFootCells(p);
        const spots = parkGround(p);
        const foot = defined(feet[pick % feet.length], "wall foot");
        const clear = defined(
          planPark(
            cells,
            cells.map(() => AIR),
            feet,
            feet.map((c) => (c === foot ? plant : AIR)),
            spots,
          ),
          "plan",
        );
        expect(clear).toEqual(
          spots.bumper.has(cellKey(foot)) ? [{ ...foot, typeId: plant }] : [],
        );
      },
    ),
  );
});

it("skips unread wall feet, even in the bumper's row", () => {
  fc.assert(
    fc.property(pose, fc.nat(), (p, pick) => {
      const cells = parkCheckCells(p);
      const feet = wallFootCells(p);
      const spots = parkGround(p);
      const bumperFeet = feet.filter((c) => spots.bumper.has(cellKey(c)));
      const foot = defined(bumperFeet[pick % bumperFeet.length], "bumper foot");
      const plant = defined([...CLEARABLE_DECORATIONS][0], "plant");
      // An unloaded block reads as undefined; it is never cleared, while a plant next to it is.
      const others = feet.filter((c) => c !== foot);
      const clear = planPark(
        cells,
        cells.map(() => AIR),
        feet,
        feet.map((c) => (c === foot ? undefined : plant)),
        spots,
      );
      expect(clear).toEqual(
        others
          .filter((c) => spots.bumper.has(cellKey(c)))
          .map((c) => ({ ...c, typeId: plant })),
      );
    }),
  );
});

it.each([
  "minecraft:golden_dandelion",
  "minecraft:open_eyeblossom",
  "minecraft:closed_eyeblossom",
  "minecraft:brown_mushroom",
  "minecraft:red_mushroom",
  "minecraft:sweet_berry_bush",
  "minecraft:firefly_bush",
  "minecraft:moss_carpet",
  "minecraft:pale_moss_carpet",
])("clears the natural ground cover %s", (typeId) => {
  expect(isPassable(typeId)).toBe(true);
});

it.each([
  "minecraft:oak_sapling",
  "minecraft:birch_sapling",
  "minecraft:torchflower",
  "minecraft:pitcher_plant",
])("still refuses the player-planted %s", (typeId) => {
  expect(isPassable(typeId)).toBe(false);
});

it("never clears natural ground, and never counts it as passable", () => {
  for (const typeId of NATURAL_GROUND) {
    expect(CLEARABLE_DECORATIONS.has(typeId)).toBe(false);
    expect(isPassable(typeId)).toBe(false);
  }
});
