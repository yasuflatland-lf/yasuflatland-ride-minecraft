import { beforeEach, expect, it, vi } from "vitest";
import { asTentId } from "../../../src/domain/camp/tent";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { TENTS_PROPERTY } from "../../../src/infrastructure/camp/identifiers";
import { DynamicPropertyTentRegistry } from "../../../src/infrastructure/camp/persistence/tentRegistry";

const game = vi.hoisted(() => ({
  getDynamicProperty: vi.fn(),
  setDynamicProperty: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({ world: game }));

const SAVED =
  '[{"id":"-4294967295","dimensionId":"minecraft:overworld","pose":{"x":110,"y":-60,"z":46,"yaw":180}}]';
const entry = {
  id: asTentId("7"),
  dimensionId: asDimensionId("minecraft:nether"),
  pose: { x: 1, y: 2, z: 3, yaw: 90 as const },
};

beforeEach(() => vi.resetAllMocks());

it("reads the world property once, on first use, and writes it on add and remove (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  const registry = new DynamicPropertyTentRegistry();
  expect(game.getDynamicProperty).not.toHaveBeenCalled();
  expect(registry.all()).toHaveLength(1);
  registry.all();
  expect(game.getDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    TENTS_PROPERTY,
  );
  registry.add(entry);
  expect(registry.all()).toHaveLength(2);
  expect(game.setDynamicProperty).toHaveBeenLastCalledWith(
    TENTS_PROPERTY,
    `${SAVED.slice(0, -1)},{"id":"7","dimensionId":"minecraft:nether","pose":{"x":1,"y":2,"z":3,"yaw":90}}]`,
  );
  registry.remove(asTentId("-4294967295"));
  expect(game.setDynamicProperty).toHaveBeenLastCalledWith(
    TENTS_PROPERTY,
    '[{"id":"7","dimensionId":"minecraft:nether","pose":{"x":1,"y":2,"z":3,"yaw":90}}]',
  );
  registry.remove(asTentId("unknown"));
  expect(game.setDynamicProperty).toHaveBeenCalledTimes(2);
  expect(game.getDynamicProperty).toHaveBeenCalledTimes(1);
});

it("starts empty without a saved property", () => {
  expect(new DynamicPropertyTentRegistry().all()).toEqual([]);
});
