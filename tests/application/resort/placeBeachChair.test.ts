import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceBeachChair } from "../../../src/application/resort/placeBeachChair";
import {
  beachChairCells,
  beachChairClearCells,
  beachChairPose,
  beachChairSupportCells,
} from "../../../src/domain/resort/beachChair";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
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
  face: fc.constant<BlockFace>("up"),
  yaw: fc.integer({ min: -360, max: 360 }),
  slot: fc.integer({ min: 0, max: 8 }),
});
it("rejects every placement obstruction before payment or spawn", () => {
  fc.assert(
    fc.property(command, fc.integer({ min: 0, max: 2 }), (cmd, reason) => {
      const world = fakeBeachChairWorld();
      if (reason === 0) cmd.face = "down";
      if (reason === 1) world.isOwnBlock.mockReturnValue(true);
      if (reason === 2) world.isSolidTop.mockReturnValue(false);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
      expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
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

it("refuses every occupied floor cell before payment", () => {
  fc.assert(
    fc.property(command, (cmd) => {
      for (const cell of beachChairCells(beachChairPose(cmd.block, cmd.yaw))) {
        const world = fakeBeachChairWorld();
        world.resortGearCells.mockReturnValue([cell]);
        expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
        expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
      }
    }),
  );
});

it("spawns the chair at the supported pose", () => {
  const world = fakeBeachChairWorld();
  const dimension = asDimensionId("overworld");
  const player = asPlayerId("p");
  const slot = 2;
  expect(
    new PlaceBeachChair(world).execute({
      player,
      dimension,
      block: { x: 10, y: 20, z: 30 },
      face: "up",
      yaw: 0,
      slot,
    }),
  ).toBe(true);
  expect(world.consumeItem).toHaveBeenCalledExactlyOnceWith(player, slot);
  expect(world.spawn).toHaveBeenCalledExactlyOnceWith(dimension, {
    foot: { x: 10, y: 21, z: 30 },
    middle: { x: 10, y: 21, z: 31 },
    head: { x: 10, y: 21, z: 32 },
    yaw: 180,
  });
});

it("shows blocked feedback when payment or spawn fails, refunding only a paid item", () => {
  fc.assert(
    fc.property(command, fc.boolean(), (cmd, paid) => {
      const world = fakeBeachChairWorld();
      world.consumeItem.mockReturnValue(paid);
      world.spawn.mockReturnValue(undefined);
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
      expect(world.spawn).toHaveBeenCalledTimes(paid ? 1 : 0);
      if (paid)
        expect(world.refund).toHaveBeenCalledExactlyOnceWith(
          cmd.player,
          cmd.slot,
        );
      else expect(world.refund).not.toHaveBeenCalled();
    }),
  );
});
