import { beforeEach, expect, it, vi } from "vitest";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../../src/domain/shared/ids";
import { roundedDistance } from "../../../../src/domain/vehicle/navigation/compass";
import { ActionBarLog } from "../../../../src/infrastructure/vehicle/bedrock/actionBarLog";
import { BedrockRadarWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockRadarWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getEntity: vi.fn(),
  currentTick: 45,
}));
vi.mock("@minecraft/server", () => ({ world: game, system: game }));

const dimension = asDimensionId("minecraft:overworld");
const center = { x: 1, y: 64, z: -12 };
const playerId = asPlayerId("driver");
const villager = "minecraft:villager_v2";
const witch = "minecraft:witch";
const createWorld = () => {
  const index = new EntityIndex();
  return new BedrockRadarWorld(
    index,
    new ActionBarLog(index, () => game.currentTick),
  );
};

beforeEach(() => vi.resetAllMocks());

it("reads the indexed vehicle's current location and dimension", () => {
  game.getEntity.mockReturnValue({
    isValid: true,
    location: center,
    dimension: { id: dimension },
  });
  expect(createWorld().position(asVehicleId("vehicle"))).toEqual({
    dimensionId: dimension,
    location: center,
  });
});

it("queries the requested dimension once per mob type", () => {
  const location = { ...center, x: 10 };
  const getEntities = vi
    .fn()
    .mockReturnValueOnce([{ typeId: villager, location }])
    .mockReturnValueOnce([]);
  game.getDimension.mockReturnValue({ getEntities });
  expect(
    createWorld().mobsNear(dimension, center, 128, [villager, witch]),
  ).toEqual([{ typeId: villager, location }]);
  expect(game.getDimension).toHaveBeenCalledExactlyOnceWith(dimension);
  expect(getEntities.mock.calls).toEqual([
    [{ location: center, maxDistance: 128, type: villager }],
    [{ location: center, maxDistance: 128, type: witch }],
  ]);
});

it("returns no hits when a dimension or entity query throws", () => {
  const fail = () => {
    throw new Error("Unavailable");
  };
  game.getDimension
    .mockImplementationOnce(fail)
    .mockReturnValueOnce({ getEntities: fail });
  const radar = createWorld();
  expect(radar.mobsNear(dimension, center, 128, [villager])).toEqual([]);
  expect(radar.mobsNear(dimension, center, 128, [villager])).toEqual([]);
});

it("writes the translated report through the shared action bar log", () => {
  const setActionBar = vi.fn();
  game.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    onScreenDisplay: { setActionBar },
  });
  const radar = createWorld();
  expect(radar.isQuiet(playerId)).toBe(true);
  radar.showReport(playerId, {
    place: "village",
    direction: "ne",
    distance: roundedDistance(center, { ...center, x: 41 }),
  });
  expect(setActionBar).toHaveBeenCalledExactlyOnceWith({
    translate: "yasu_ride.radar.report",
    with: {
      rawtext: [
        { translate: "yasu_ride.radar.dir.ne" },
        { text: "40" },
        { translate: "yasu_ride.radar.place.village" },
      ],
    },
  });
  expect(radar.isQuiet(playerId)).toBe(false);
});
