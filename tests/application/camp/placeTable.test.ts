import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import { TABLE_SPEC } from "../../../src/domain/camp/spec";
import { facePlayer } from "../../../src/domain/shared/facing";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { fakeTableWorld as fakeWorld } from "./fakeTableWorld";

const dimensionId = asDimensionId("overworld");
const playerId = asPlayerId("player");

describe("placing a camp table", () => {
  it("centers it between two ground cells so two chairs align under its ends", () => {
    const world = fakeWorld();
    const place = new PlaceTable(world);
    expect(
      place.execute({
        playerId,
        dimensionId,
        blockLocation: { x: 4, y: 7, z: 2 },
        yaw: 180,
        slot: 1,
      }),
    ).toBe(true);
    expect(world.spawnTable).toHaveBeenCalledWith(
      dimensionId,
      { x: 5, y: 8, z: 2.5 },
      0,
    );
  });

  const cmd = {
    playerId,
    dimensionId,
    blockLocation: { x: 4, y: 7, z: 2 },
    yaw: 180,
    slot: 1,
  };

  it("refuses to stack a second table on the same spot and keeps the item", () => {
    const world = fakeWorld();
    vi.mocked(world.hasTableNear).mockReturnValue(true);
    expect(new PlaceTable(world).execute(cmd)).toBe(false);
    expect(world.hasTableNear).toHaveBeenCalledWith(dimensionId, {
      x: 5,
      y: 8,
      z: 2.5,
    });
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(world.spawnTable).not.toHaveBeenCalled();
  });

  it("checks both table cells and centers the table for any yaw", () => {
    fc.assert(
      fc.property(
        fc.record({
          x: fc.integer({ min: -100, max: 100 }),
          y: fc.integer({ min: -60, max: 300 }),
          z: fc.integer({ min: -100, max: 100 }),
        }),
        fc.integer({ min: -360, max: 360 }),
        fc.constantFrom("none", "own", "air", "vehicle", "near"),
        fc.integer({ min: 0, max: 1 }),
        fc.integer({ min: 1, max: TABLE_SPEC.clearance }),
        (blockLocation, yaw, refusal, index, dy) => {
          const world = fakeWorld();
          const facing = facePlayer(yaw);
          const alongX = Math.abs(facing) % 180 === 0;
          const cell = {
            x: blockLocation.x + (alongX ? index : 0),
            y: blockLocation.y,
            z: blockLocation.z + (alongX ? 0 : index),
          };
          const matches = (at: typeof cell, height: number) =>
            at.x === cell.x && at.y === cell.y + height && at.z === cell.z;
          world.isOwnBlock.mockImplementation(
            (_d, at) => refusal === "own" && matches(at, 0),
          );
          world.isAir.mockImplementation(
            (_d, at) => refusal !== "air" || !matches(at, dy),
          );
          world.isVehicleSpace.mockImplementation(
            (_d, at) => refusal === "vehicle" && matches(at, dy),
          );
          world.hasTableNear.mockReturnValue(refusal === "near");
          const placed = new PlaceTable(world).execute({
            ...cmd,
            blockLocation,
            yaw,
          });
          expect(placed).toBe(refusal === "none");
          if (refusal !== "none") {
            expect(world.consumeItem).not.toHaveBeenCalled();
            expect(world.spawnTable).not.toHaveBeenCalled();
          } else {
            expect(world.spawnTable).toHaveBeenCalledExactlyOnceWith(
              dimensionId,
              {
                x: blockLocation.x + (alongX ? 1 : 0.5),
                y: blockLocation.y + 1,
                z: blockLocation.z + (alongX ? 0.5 : 1),
              },
              facing,
            );
          }
        },
      ),
    );
  });

  it("accepts a block's top face only, and never one of our own blocks", () => {
    const world = fakeWorld();
    const place = new PlaceTable(world);
    const block = { x: 1, y: 2, z: 3 };
    expect(place.canUseBlock(dimensionId, block, "up")).toBe(true);
    expect(place.canUseBlock(dimensionId, block, "north")).toBe(false);
    vi.mocked(world.isOwnBlock).mockReturnValue(true);
    expect(place.canUseBlock(dimensionId, block, "up")).toBe(false);
  });
});
