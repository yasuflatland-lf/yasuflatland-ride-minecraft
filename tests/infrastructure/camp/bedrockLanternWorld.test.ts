import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTentId } from "../../../src/domain/camp/tent";
import { BedrockLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockLanternWorld";
import {
  TENT_LANTERN_PROPERTY,
  TENT_TYPE,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

const TENT = asTentId("-5");

function tentEntity(over: Partial<{ isValid: boolean; typeId: string }> = {}) {
  let lantern: unknown = false;
  const entity = {
    isValid: true,
    typeId: TENT_TYPE,
    location: { x: 1.5, y: 2, z: 3.5 },
    dimension: { playSound: vi.fn() },
    getProperty: vi.fn((key: string) =>
      key === TENT_LANTERN_PROPERTY ? lantern : undefined,
    ),
    setProperty: vi.fn((key: string, value: unknown) => {
      if (key === TENT_LANTERN_PROPERTY) lantern = value;
    }),
    ...over,
  };
  game.getEntity.mockImplementation((id: string) =>
    id === TENT ? entity : undefined,
  );
  return entity;
}

describe("BedrockLanternWorld", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the lantern property of a loaded tent", () => {
    const entity = tentEntity();
    const world = new BedrockLanternWorld();
    expect(world.lanternOf(TENT)).toBe(false);
    entity.setProperty(TENT_LANTERN_PROPERTY, true);
    expect(world.lanternOf(TENT)).toBe(true);
  });

  it("knows no lantern for a missing, invalid, or other entity", () => {
    const world = new BedrockLanternWorld();
    tentEntity();
    expect(world.lanternOf(asTentId("other"))).toBeUndefined();
    tentEntity({ isValid: false });
    expect(world.lanternOf(TENT)).toBeUndefined();
    tentEntity({ typeId: "minecraft:cow" });
    expect(world.lanternOf(TENT)).toBeUndefined();
  });

  it("sets the property and clicks at the tent", () => {
    const entity = tentEntity();
    new BedrockLanternWorld().setLantern(TENT, true);
    expect(entity.setProperty).toHaveBeenCalledExactlyOnceWith(
      "yasu_ride:lantern",
      true,
    );
    expect(entity.dimension.playSound).toHaveBeenCalledExactlyOnceWith(
      "random.click",
      entity.location,
    );
  });

  it("leaves a missing or invalid tent alone and stays silent", () => {
    const world = new BedrockLanternWorld();
    const loaded = tentEntity();
    world.setLantern(asTentId("other"), true);
    expect(loaded.setProperty).not.toHaveBeenCalled();
    expect(loaded.dimension.playSound).not.toHaveBeenCalled();
    const invalid = tentEntity({ isValid: false });
    world.setLantern(TENT, true);
    expect(invalid.setProperty).not.toHaveBeenCalled();
    expect(invalid.dimension.playSound).not.toHaveBeenCalled();
  });
});
