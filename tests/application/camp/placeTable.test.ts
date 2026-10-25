import { describe, expect, it, vi } from "vitest";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import type { TableWorld } from "../../../src/application/camp/ports/table";
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
});
