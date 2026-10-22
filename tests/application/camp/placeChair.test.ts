import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  PlaceChair,
  type PlaceChairCommand,
} from "../../../src/application/camp/placeChair";
import { chairYaw } from "../../../src/domain/camp/chair";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { cellKey, FakeChairWorld } from "./fakeChairWorld";

const DIM = asDimensionId("minecraft:overworld");
const block = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -100, max: 100 }),
});
const command = fc.record({
  blockLocation: block,
  yaw: fc.double({ min: -180, max: 180, noNaN: true }),
  slot: fc.integer({ min: 0, max: 8 }),
});
const cmdOf = (c: {
  blockLocation: { x: number; y: number; z: number };
  yaw: number;
  slot: number;
}): PlaceChairCommand => ({
  ...c,
  playerId: asPlayerId("player"),
  dimensionId: DIM,
});
const up = (b: { x: number; y: number; z: number }, dy: number) =>
  cellKey({ x: b.x, y: b.y + dy, z: b.z });

type Refusal = "vehicle" | "own" | "room1" | "room2" | "chair" | "consume";
const REFUSALS: Refusal[] = [
  "vehicle",
  "own",
  "room1",
  "room2",
  "chair",
  "consume",
];

function refuse(
  world: FakeChairWorld,
  b: PlaceChairCommand["blockLocation"],
  why: Refusal,
) {
  if (why === "vehicle") world.vehicleSpace.add(up(b, 1));
  if (why === "own") world.ownBlocks.add(up(b, 0));
  if (why === "room1") world.solid.add(up(b, 1));
  if (why === "room2") world.solid.add(up(b, 2));
  if (why === "chair") world.chairs.add(up(b, 1));
  if (why === "consume") world.consumeResult = false;
}

describe("PlaceChair (ADR 0122)", () => {
  it("spawns one chair on top of the block, facing the player, and takes the item from the slot", () => {
    fc.assert(
      fc.property(command, (c) => {
        const world = new FakeChairWorld();
        expect(new PlaceChair(world).execute(cmdOf(c))).toBe(true);
        const b = c.blockLocation;
        expect(world.spawned).toEqual([
          {
            at: { x: b.x + 0.5, y: b.y + 1, z: b.z + 0.5 },
            yaw: chairYaw(c.yaw),
          },
        ]);
        expect(world.consumed).toEqual([
          { playerId: asPlayerId("player"), slot: c.slot },
        ]);
      }),
    );
  });

  it("leaves the item and spawns nothing on any refusal", () => {
    fc.assert(
      fc.property(
        command,
        fc.subarray(REFUSALS, { minLength: 1 }),
        (c, whys) => {
          const world = new FakeChairWorld();
          for (const why of whys) refuse(world, c.blockLocation, why);
          expect(new PlaceChair(world).execute(cmdOf(c))).toBe(false);
          expect(world.spawned).toEqual([]);
          expect(world.consumed).toEqual([]);
        },
      ),
    );
  });

  it("does not take the item in Creative", () => {
    fc.assert(
      fc.property(command, (c) => {
        const world = new FakeChairWorld();
        world.creative = true;
        world.consumeResult = false;
        expect(new PlaceChair(world).execute(cmdOf(c))).toBe(true);
        expect(world.spawned).toHaveLength(1);
        expect(world.consumed).toEqual([]);
      }),
    );
  });

  describe("cellFor", () => {
    it("gives the clicked block from its top face only", () => {
      const world = new FakeChairWorld();
      const place = new PlaceChair(world);
      const at = { x: 3, y: 64, z: -2 };
      expect(place.cellFor(DIM, at, "up")).toEqual(at);
      for (const face of ["down", "north", "south", "east", "west"] as const)
        expect(place.cellFor(DIM, at, face)).toBeUndefined();
    });

    it("leaves the click alone on our blocks and in the vehicles' space", () => {
      fc.assert(
        fc.property(
          block,
          fc.constantFrom<Refusal>("vehicle", "own"),
          (b, why) => {
            const world = new FakeChairWorld();
            refuse(world, b, why);
            expect(new PlaceChair(world).cellFor(DIM, b, "up")).toBeUndefined();
          },
        ),
      );
    });

    it("still claims the click where only the room above is missing, so execute can refuse it", () => {
      const world = new FakeChairWorld();
      const b = { x: 0, y: 64, z: 0 };
      refuse(world, b, "room1");
      expect(new PlaceChair(world).cellFor(DIM, b, "up")).toEqual(b);
    });
  });
});
