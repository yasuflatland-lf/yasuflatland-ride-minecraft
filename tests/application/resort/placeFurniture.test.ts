import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PlaceFurniture } from "../../../src/application/resort/placeFurniture";
import {
  FURNITURE_SPEC,
  type FurnitureKind,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../../src/domain/resort/furniture";
import { cellKey } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { fakeFurnitureWorld } from "./fakeFurnitureWorld";

describe.each(Object.keys(FURNITURE_SPEC) as FurnitureKind[])("%s", (kind) => {
  const command = fc.record({
    kind: fc.constant(kind),
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
        const world = fakeFurnitureWorld(kind);
        if (reason === 0) cmd.face = "down";
        if (reason === 1) world.isOwnBlock.mockReturnValue(true);
        if (reason === 2) world.isSolidTop.mockReturnValue(false);
        if (reason === 3) world.isAir.mockReturnValue(false);
        if (reason === 4) world.isVehicleSpace.mockReturnValue(true);
        if (reason === 5) world.isCampSpace.mockReturnValue(true);
        expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawn).not.toHaveBeenCalled();
        expect(world.showBlocked).toHaveBeenCalledExactlyOnceWith(cmd.player);
      }),
    );
  });
  it("places furniture and charges only Survival", () => {
    fc.assert(
      fc.property(command, fc.boolean(), (cmd, creative) => {
        const world = fakeFurnitureWorld(kind);
        world.isCreative.mockReturnValue(creative);
        expect(new PlaceFurniture(world).execute(cmd)).toBe(true);
        expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
        expect(world.layTop).toHaveBeenCalledTimes(
          FURNITURE_SPEC[kind].top ? 1 : 0,
        );
        if (FURNITURE_SPEC[kind].top) {
          expect(world.layTop).toHaveBeenCalledWith(
            world.spawn.mock.results[0]?.value,
          );
          expect(world.spawn.mock.invocationCallOrder[0]).toBeLessThan(
            world.layTop.mock.invocationCallOrder[0] ?? 0,
          );
        }
        expect(world.spawn).toHaveBeenCalledExactlyOnceWith(
          cmd.dimension,
          furniturePose(cmd.block, cmd.yaw, kind),
        );
      }),
    );
  });
  it("refunds failed spawns only when payment succeeded", () => {
    fc.assert(
      fc.property(command, fc.boolean(), (cmd, creative) => {
        const world = fakeFurnitureWorld(kind);
        world.isCreative.mockReturnValue(creative);
        world.spawn.mockReturnValue(undefined);
        expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
        expect(world.refund).toHaveBeenCalledTimes(creative ? 0 : 1);
        expect(world.layTop).not.toHaveBeenCalled();
        if (!creative)
          expect(world.refund).toHaveBeenCalledWith(cmd.player, kind, cmd.slot);
      }),
    );
  });
  it("does not spawn when the held item changed before payment", () => {
    fc.assert(
      fc.property(command, (cmd) => {
        const world = fakeFurnitureWorld(kind);
        world.consumeItem.mockReturnValue(false);
        expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
        expect(world.spawn).not.toHaveBeenCalled();
        expect(world.refund).not.toHaveBeenCalled();
      }),
    );
  });

  it("rejects an obstruction over any of the footprint cells before charging", () => {
    fc.assert(
      fc.property(command, fc.nat(), (cmd, index) => {
        const cells = furnitureClearCells(
          furniturePose(cmd.block, cmd.yaw, kind),
        );
        const obstruction = cells[index % cells.length];
        if (!obstruction) throw Error("empty footprint");
        for (const check of [
          "isAir",
          "isVehicleSpace",
          "isCampSpace",
        ] as const) {
          const world = fakeFurnitureWorld(kind);
          world[check].mockImplementation((_dimension, cell) =>
            check === "isAir"
              ? cellKey(cell) !== cellKey(obstruction)
              : cellKey(cell) === cellKey(obstruction),
          );
          expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
        }
      }),
    );
  });
  it("requires solid support below every footprint cell", () => {
    fc.assert(
      fc.property(command, (cmd) => {
        for (const support of furnitureSupportCells(
          furniturePose(cmd.block, cmd.yaw, kind),
        )) {
          const world = fakeFurnitureWorld(kind);
          world.isSolidTop.mockImplementation(
            (_dimension, cell) => cellKey(cell) !== cellKey(support),
          );
          expect(new PlaceFurniture(world).execute(cmd)).toBe(false);
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
        }
      }),
    );
  });
});
