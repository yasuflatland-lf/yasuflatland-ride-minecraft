import { beforeEach, expect, it, vi } from "vitest";
import { asTentId } from "../../../src/domain/camp/tent";
import { snapYaw } from "../../../src/domain/shared/facing";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { TENTS_PROPERTY } from "../../../src/infrastructure/camp/identifiers";
import { DynamicPropertyTentRegistry } from "../../../src/infrastructure/camp/persistence/tentRegistry";

const game = vi.hoisted(() => ({
  getDynamicProperty: vi.fn(),
  setDynamicProperty: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({ world: game }));

const LEGACY_SAVE =
  '[{"id":"-4294967295","dimensionId":"minecraft:overworld","pose":{"x":110,"y":-60,"z":46,"yaw":180}}]';
const legacyEntry = {
  id: asTentId("-4294967295"),
  dimensionId: asDimensionId("minecraft:overworld"),
  pose: { x: 110, y: -60, z: 46, yaw: snapYaw(180) },
  layout: 1,
};
const entry = {
  layout: 1,
  id: asTentId("7"),
  dimensionId: asDimensionId("minecraft:nether"),
  pose: { x: 1, y: 2, z: 3, yaw: snapYaw(90) },
};

function savedEntries(): unknown {
  const [key, value] = game.setDynamicProperty.mock.lastCall ?? [];
  expect(key).toBe(TENTS_PROPERTY);
  return JSON.parse(value);
}

beforeEach(() => vi.resetAllMocks());

it("reads the world property once, on first use, and writes it on add and remove (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(LEGACY_SAVE);
  const registry = new DynamicPropertyTentRegistry();
  expect(game.getDynamicProperty).not.toHaveBeenCalled();
  expect(registry.all()).toEqual([legacyEntry]);
  registry.all();
  expect(game.getDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    TENTS_PROPERTY,
  );
  registry.add(entry);
  expect(registry.all()).toHaveLength(2);
  expect(savedEntries()).toEqual([legacyEntry, entry]);
  registry.remove(legacyEntry.id);
  expect(savedEntries()).toEqual([entry]);
  registry.remove(asTentId("unknown"));
  expect(game.setDynamicProperty).toHaveBeenCalledTimes(2);
  expect(game.getDynamicProperty).toHaveBeenCalledTimes(1);
});

it("starts empty without a saved property", () => {
  expect(new DynamicPropertyTentRegistry().all()).toEqual([]);
});
