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

it("rejects an obstruction in any translated foot cell before charging", () => {
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
it("requires solid support below both cells", () => {
  fc.assert(
    fc.property(command, fc.integer({ min: 0, max: 1 }), (cmd, index) => {
      const world = fakeBeachChairWorld();
      const support = beachChairSupportCells(
        beachChairPose(cmd.block, cmd.yaw),
      )[index];
      if (!support) throw Error("missing support");
      world.isSolidTop.mockImplementation(
        (_dimension, cell) => cellKey(cell) !== cellKey(support),
      );
      expect(new PlaceBeachChair(world).execute(cmd)).toBe(false);
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
    }),
  );
});
