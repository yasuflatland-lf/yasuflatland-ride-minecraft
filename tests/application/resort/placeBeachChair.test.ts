import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceBeachChair } from "../../../src/application/resort/placeBeachChair";
import {
  beachChairClearCells,
  beachChairPose,
  beachChairSupportCells,
} from "../../../src/domain/resort/beachChair";
import { cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { fakeBeachChairWorld } from "./fakeBeachChairWorld";

const command = fc.record({
  player: fc.constant(asPlayerId("p")),
  dimension: fc.constant(asDimensionId("overworld")),
  block: fc.record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: 0, max: 200 }),
    z: fc.integer({ min: -1000, max: 1000 }),
  }),
  face: fc.constant<string>("up"),
  yaw: fc.integer({ min: -360, max: 360 }),
  slot: fc.integer({ min: 0, max: 8 }),
});
it("rejects every placement obstruction before payment or spawn", () => {
  fc.assert(
    fc.property(command, fc.integer({ min: 0, max: 5 }), (cmd, reason) => {
      const world = fakeBeachChairWorld();
      if (reason === 0) cmd.face = "down";
      if (reason === 1) world.isOwnBlock.mockReturnValue(true);
      if (reason === 2) world.isSolidTop.mockReturnValue(false);
      if (reason === 3) world.isAir.mockReturnValue(false);
      if (reason === 4) world.isVehicleSpace.mockReturnValue(true);
      if (reason === 5) world.isCampSpace.mockReturnValue(true);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
      expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
    }),
  );
});
it("places the chair and charges only Survival", () => {
  fc.assert(
    fc.property(command, fc.boolean(), (cmd, creative) => {
      const world = fakeBeachChairWorld();
      world.isCreative.mockReturnValue(creative);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(true);
      expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
      expect(world.spawn).toHaveBeenCalledExactlyOnceWith(
        cmd.dimension,
        beachChairPose(cmd.block, cmd.yaw),
      );
    }),
  );
});
it("refunds failed spawns only when payment succeeded", () => {
  fc.assert(
    fc.property(command, fc.boolean(), (cmd, creative) => {
      const world = fakeBeachChairWorld();
      world.isCreative.mockReturnValue(creative);
      world.spawn.mockReturnValue(undefined);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.refund).toHaveBeenCalledTimes(creative ? 0 : 1);
      if (!creative)
        expect(world.refund).toHaveBeenCalledWith(cmd.player, cmd.slot);
    }),
  );
});
it("does not spawn when the held item changed before payment", () => {
  fc.assert(
    fc.property(command, (cmd) => {
      const world = fakeBeachChairWorld();
      world.consumeItem.mockReturnValue(false);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.spawn).not.toHaveBeenCalled();
      expect(world.refund).not.toHaveBeenCalled();
    }),
  );
});

it("rejects an obstruction over any of the three footprint cells before charging", () => {
  fc.assert(
    fc.property(command, fc.nat(), (cmd, index) => {
      const cells = beachChairClearCells(beachChairPose(cmd.block, cmd.yaw));
      const obstruction = cells[index % cells.length];
      if (!obstruction) throw Error("empty footprint");
      for (const check of ["isAir", "isVehicleSpace", "isCampSpace"] as const) {
        const world = fakeBeachChairWorld();
        world[check].mockImplementation((_dimension, cell) =>
          check === "isAir"
            ? cellKey(cell) !== cellKey(obstruction)
            : cellKey(cell) === cellKey(obstruction),
        );
        expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
      }
    }),
  );
});
it("requires solid support below all three cells", () => {
  fc.assert(
    fc.property(command, (cmd) => {
      for (const support of beachChairSupportCells(
        beachChairPose(cmd.block, cmd.yaw),
      )) {
        const world = fakeBeachChairWorld();
        world.isSolidTop.mockImplementation(
          (_dimension, cell) => cellKey(cell) !== cellKey(support),
        );
        expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
      }
    }),
  );
});

it("queries exactly three support cells and six clearance cells", () => {
  const world = fakeBeachChairWorld();
  const dimension = asDimensionId("overworld");
  expect(
    new PlaceBeachChair(world).execute({
      player: asPlayerId("p"),
      dimension,
      block: { x: 10, y: 20, z: 30 },
      face: "up",
      yaw: 0,
      slot: 0,
    }),
  ).toBe(true);
  expect(world.isSolidTop.mock.calls).toEqual([
    [dimension, { x: 10, y: 20, z: 30 }],
    [dimension, { x: 10, y: 20, z: 31 }],
    [dimension, { x: 10, y: 20, z: 32 }],
  ]);
  const clearance = [
    [dimension, { x: 10, y: 21, z: 30 }],
    [dimension, { x: 10, y: 21, z: 31 }],
    [dimension, { x: 10, y: 21, z: 32 }],
    [dimension, { x: 10, y: 22, z: 30 }],
    [dimension, { x: 10, y: 22, z: 31 }],
    [dimension, { x: 10, y: 22, z: 32 }],
  ];
  for (const check of [world.isAir, world.isVehicleSpace, world.isCampSpace])
    expect(check.mock.calls).toEqual(clearance);
  expect(world.spawn).toHaveBeenCalledExactlyOnceWith(dimension, {
    foot: { x: 10, y: 21, z: 30 },
    middle: { x: 10, y: 21, z: 31 },
    head: { x: 10, y: 21, z: 32 },
    yaw: 180,
  });
});
