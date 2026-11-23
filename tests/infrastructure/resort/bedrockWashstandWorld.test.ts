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
  game.getDimension.mockImplementation((name: string) => ({
    getEntities: ({ type }: { type: string }) =>
      type === FURNITURE_IDS.washstand.entity ? [{ id: name }] : [],
  }));
  expect(new Set(new BedrockWashstandWorld().loadedWashstands())).toEqual(
    new Set(["overworld", "nether", "the_end"]),
  );
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
