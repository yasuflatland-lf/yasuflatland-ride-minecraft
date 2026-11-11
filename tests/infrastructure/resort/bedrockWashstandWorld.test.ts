import { beforeEach, expect, it, vi } from "vitest";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { BedrockWashstandWorld } from "../../../src/infrastructure/resort/bedrock/bedrockWashstandWorld";
import {
  FURNITURE_IDS,
  WASHSTAND_RUNNING,
} from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));
beforeEach(() => vi.clearAllMocks());
const id = asFurnitureId("washstand");
it.each([true, false])("writes the running property as %s", (on) => {
  const setProperty = vi.fn();
  game.getEntity.mockReturnValue({
    typeId: FURNITURE_IDS.washstand.entity,
    isValid: true,
    setProperty,
  });
  new BedrockWashstandWorld().setRunning(id, on);
  expect(setProperty).toHaveBeenCalledExactlyOnceWith(WASHSTAND_RUNNING, on);
});
it("collects loaded washstands in every dimension", () => {
  const queries = vi.fn();
  game.getDimension.mockImplementation((name: string) => ({
    getEntities: (query: unknown) => {
      queries(query);
      return [{ id: name }];
    },
  }));
  expect(new BedrockWashstandWorld().loadedWashstands()).toEqual([
    "overworld",
    "nether",
    "the_end",
  ]);
  expect(game.getDimension.mock.calls.map(([name]) => name)).toEqual([
    "overworld",
    "nether",
    "the_end",
  ]);
  expect(queries).toHaveBeenCalledTimes(3);
  expect(queries).toHaveBeenCalledWith({
    type: FURNITURE_IDS.washstand.entity,
  });
});
it("ignores missing, invalid, wrong-type and throwing lookups", () => {
  const adapter = new BedrockWashstandWorld();
  const setProperty = vi.fn();
  for (const entity of [
    undefined,
    { typeId: FURNITURE_IDS.washstand.entity, isValid: false, setProperty },
    { typeId: "minecraft:pig", isValid: true, setProperty },
  ]) {
    game.getEntity.mockReturnValue(entity);
    expect(adapter.entity(id)).toBeUndefined();
    adapter.setRunning(id, true);
  }
  game.getEntity.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(() => adapter.setRunning(id, true)).not.toThrow();
  expect(setProperty).not.toHaveBeenCalled();
});
