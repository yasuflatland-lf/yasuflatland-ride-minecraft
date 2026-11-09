import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceParasol } from "../../../src/application/resort/placeParasol";
import { parasolPose } from "../../../src/domain/resort/parasolPose";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { fakeParasolWorld } from "./fakeParasolWorld";

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
    fc.property(command, fc.integer({ min: 0, max: 6 }), (cmd, reason) => {
      const world = fakeParasolWorld();
      if (reason === 0) cmd.face = "down";
      if (reason === 1) world.isOwnBlock.mockReturnValue(true);
      if (reason === 2) world.isSolidTop.mockReturnValue(false);
      if (reason === 3) world.isAir.mockReturnValue(false);
      if (reason === 4) world.isVehicleSpace.mockReturnValue(true);
      if (reason === 5) world.isCampSpace.mockReturnValue(true);
      if (reason === 6)
        world.baseCellsNear.mockReturnValue([
          parasolPose(cmd.block, cmd.yaw).base,
        ]);
      expect(new PlaceParasol(world).execute(cmd)).toBe(false);
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
      expect(world.layCeiling).not.toHaveBeenCalled();
      expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
    }),
  );
});
it("lays a ceiling after spawn and charges only Survival", () => {
  fc.assert(
    fc.property(command, fc.boolean(), (cmd, creative) => {
      const world = fakeParasolWorld();
      world.isCreative.mockReturnValue(creative);
      expect(new PlaceParasol(world).execute(cmd)).toBe(true);
      expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
      expect(world.spawn).toHaveBeenCalledExactlyOnceWith(
        cmd.dimension,
        parasolPose(cmd.block, cmd.yaw),
      );
      expect(world.layCeiling).toHaveBeenCalledExactlyOnceWith("parasol");
      expect(world.spawn.mock.invocationCallOrder[0]).toBeLessThan(
        world.layCeiling.mock.invocationCallOrder[0] ?? 0,
      );
    }),
  );
});
it("refunds failed spawns only when payment succeeded", () => {
  fc.assert(
    fc.property(command, fc.boolean(), (cmd, creative) => {
      const world = fakeParasolWorld();
      world.isCreative.mockReturnValue(creative);
      world.spawn.mockReturnValue(undefined);
      expect(new PlaceParasol(world).execute(cmd)).toBe(false);
      expect(world.refund).toHaveBeenCalledTimes(creative ? 0 : 1);
      if (!creative)
        expect(world.refund).toHaveBeenCalledWith(cmd.player, cmd.slot);
      expect(world.layCeiling).not.toHaveBeenCalled();
    }),
  );
});
it("does not spawn when the held item changed before payment", () => {
  fc.assert(
    fc.property(command, (cmd) => {
      const world = fakeParasolWorld();
      world.consumeItem.mockReturnValue(false);
      expect(new PlaceParasol(world).execute(cmd)).toBe(false);
      expect(world.spawn).not.toHaveBeenCalled();
      expect(world.refund).not.toHaveBeenCalled();
    }),
  );
});
