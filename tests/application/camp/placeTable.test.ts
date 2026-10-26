import { describe, expect, it, vi } from "vitest";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import type { TableWorld } from "../../../src/application/camp/ports/table";
import { TABLE_SPEC } from "../../../src/domain/camp/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

const dimensionId = asDimensionId("overworld");
const playerId = asPlayerId("player");

function fakeWorld(): TableWorld {
  return {
    isAir: vi.fn(() => true),
    isOwnBlock: vi.fn(() => false),
    isVehicleSpace: vi.fn(() => false),
    hasTableNear: vi.fn(() => false),
    isCreative: vi.fn(() => false),
    consumeItem: vi.fn(() => true),
    spawnTable: vi.fn(),
    isOccupied: vi.fn(() => false),
    dropItem: vi.fn(),
    removeTable: vi.fn(),
    showHitsLeft: vi.fn(),
  };
}

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

  it("refuses placement when the second chair-side cell is blocked", () => {
    const world = fakeWorld();
    vi.mocked(world.isAir).mockImplementation((_d, at) => at.x !== 5);
    const place = new PlaceTable(world);
    expect(
      place.execute({
        playerId,
        dimensionId,
        blockLocation: { x: 4, y: 7, z: 2 },
        yaw: 180,
        slot: 1,
      }),
    ).toBe(false);
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(world.spawnTable).not.toHaveBeenCalled();
  });

  const cmd = {
    playerId,
    dimensionId,
    blockLocation: { x: 4, y: 7, z: 2 },
    yaw: 180,
    slot: 1,
  };

  it("runs the long axis along z and centers there when the player faces east or west", () => {
    const world = fakeWorld();
    expect(new PlaceTable(world).execute({ ...cmd, yaw: 90 })).toBe(true);
    const [, at, yaw] = vi.mocked(world.spawnTable).mock.calls[0] ?? [];
    expect(Math.abs(yaw ?? 0) % 180).toBe(90);
    expect(at).toEqual({ x: 4.5, y: 8, z: 3 });
  });

  it("refuses when a vehicle occupies the space above either cell", () => {
    const world = fakeWorld();
    vi.mocked(world.isVehicleSpace).mockImplementation(
      (_d, at) => at.x === 5 && at.y > cmd.blockLocation.y,
    );
    expect(new PlaceTable(world).execute(cmd)).toBe(false);
    expect(world.spawnTable).not.toHaveBeenCalled();
  });

  it("refuses when either ground cell is already one of our blocks", () => {
    const world = fakeWorld();
    vi.mocked(world.isOwnBlock).mockImplementation(
      (_d, at) => at.x === 5 && at.y === cmd.blockLocation.y,
    );
    expect(new PlaceTable(world).execute(cmd)).toBe(false);
    expect(world.consumeItem).not.toHaveBeenCalled();
  });

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

  it("refuses when only the topmost cell of the clearance column is blocked", () => {
    const world = fakeWorld();
    const top = cmd.blockLocation.y + TABLE_SPEC.clearance;
    vi.mocked(world.isAir).mockImplementation((_d, at) => at.y !== top);
    expect(new PlaceTable(world).execute(cmd)).toBe(false);
    expect(world.spawnTable).not.toHaveBeenCalled();
  });

  it("takes the item from the slot the player used", () => {
    const world = fakeWorld();
    new PlaceTable(world).execute({ ...cmd, slot: 3 });
    expect(world.consumeItem).toHaveBeenCalledWith(playerId, 3);
  });

  it("spawns nothing when the item cannot be taken from the slot", () => {
    const world = fakeWorld();
    vi.mocked(world.consumeItem).mockReturnValue(false);
    expect(new PlaceTable(world).execute(cmd)).toBe(false);
    expect(world.spawnTable).not.toHaveBeenCalled();
  });

  it("does not take the item in Creative", () => {
    const world = fakeWorld();
    vi.mocked(world.isCreative).mockReturnValue(true);
    expect(new PlaceTable(world).execute(cmd)).toBe(true);
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(world.spawnTable).toHaveBeenCalledOnce();
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
