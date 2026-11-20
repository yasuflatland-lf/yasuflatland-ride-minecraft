import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceParasol } from "../../../src/application/resort/placeParasol";
import {
  parasolFootCells,
  parasolPose,
  parasolSupportCell,
} from "../../../src/domain/resort/parasolPose";
import { cellKey } from "../../../src/domain/shared/cells";
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
it("lays a ceiling after placing a parasol and shows feedback if placement fails", () => {
  const cmd = {
    player: asPlayerId("p"),
    dimension: asDimensionId("overworld"),
    block: { x: 10, y: 20, z: 30 },
    face: "up",
    yaw: 0,
    slot: 2,
  };
  const world = fakeParasolWorld();
  const place = new PlaceParasol(world);
  expect(place.execute(cmd)).toBe(true);
  expect(world.consumeItem).toHaveBeenCalledExactlyOnceWith(
    cmd.player,
    cmd.slot,
  );
  expect(world.spawn).toHaveBeenCalledExactlyOnceWith(
    cmd.dimension,
    parasolPose(cmd.block, cmd.yaw),
  );
  expect(world.layCeiling).toHaveBeenCalledExactlyOnceWith("parasol");
  expect(world.spawn).toHaveBeenCalledBefore(world.layCeiling);

  world.layCeiling.mockClear();
  world.spawn.mockReturnValue(undefined);
  expect(place.execute(cmd)).toBe(false);
  expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
  expect(world.layCeiling).not.toHaveBeenCalled();
});

it("rejects an obstruction in any translated foot cell before charging", () => {
  fc.assert(
    fc.property(command, fc.nat(), (cmd, index) => {
      const cells = parasolFootCells(parasolPose(cmd.block, cmd.yaw));
      const obstruction = cells[index % cells.length];
      if (!obstruction) throw Error("empty footprint");
      for (const check of ["isAir", "isVehicleSpace", "isCampSpace"] as const) {
        const world = fakeParasolWorld();
        world[check].mockImplementation((_dimension, cell) =>
          check === "isAir"
            ? cellKey(cell) !== cellKey(obstruction)
            : cellKey(cell) === cellKey(obstruction),
        );
        expect(new PlaceParasol(world).execute(cmd)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
      }
    }),
  );
});
it("requires solid support below the actual base centre", () => {
  fc.assert(
    fc.property(command, (cmd) => {
      const world = fakeParasolWorld();
      const support = parasolSupportCell(parasolPose(cmd.block, cmd.yaw));
      world.isSolidTop.mockImplementation(
        (_dimension, cell) =>
          cellKey(cell) === cellKey(cmd.block) ||
          cellKey(cell) === cellKey(support),
      );
      expect(new PlaceParasol(world).execute(cmd)).toBe(true);
      world.isSolidTop.mockImplementation(
        (_dimension, cell) => cellKey(cell) === cellKey(cmd.block),
      );
      world.spawn.mockClear();
      world.consumeItem.mockClear();
      expect(new PlaceParasol(world).execute(cmd)).toBe(false);
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
    }),
  );
});
