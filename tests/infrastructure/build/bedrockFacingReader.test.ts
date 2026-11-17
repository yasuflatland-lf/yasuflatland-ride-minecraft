import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockFacingReader } from "../../../src/infrastructure/build/bedrock/bedrockFacingReader";

const engine = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  GameMode: {},
  world: { getEntity: engine.getEntity },
}));
const id = asPlayerId("builder");
const reader = new BedrockFacingReader();
it("prefers view direction over body yaw", () => {
  fc.assert(
    fc.property(fc.integer({ min: -360, max: 360 }), (yaw) => {
      const getRotation = vi.fn(() => ({ y: yaw }));
      engine.getEntity.mockReturnValue({
        typeId: "minecraft:player",
        isValid: true,
        getViewDirection: () => ({ x: 1, y: -1, z: 0 }),
        getRotation,
      });
      expect(reader.facingOf(id)).toBe("east");
      expect(getRotation).not.toHaveBeenCalled();
    }),
  );
});
it.each([
  [0, "south"],
  [90, "west"],
  [180, "north"],
  [270, "east"],
])("uses yaw %s when looking straight down", (yaw, facing) => {
  engine.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
    getRotation: () => ({ y: yaw }),
  });
  expect(reader.facingOf(id)).toBe(facing);
});
it("uses north for unavailable or invalid players and unavailable yaw", () => {
  for (const entity of [
    undefined,
    { typeId: "minecraft:player", isValid: false },
    { typeId: "minecraft:pig", isValid: true },
    {
      typeId: "minecraft:player",
      isValid: true,
      getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
      getRotation: () => {
        throw new Error("gone");
      },
    },
  ]) {
    engine.getEntity.mockReturnValue(entity);
    expect(reader.facingOf(id)).toBe("north");
  }
});
it("uses body yaw if reading the view direction throws", () => {
  engine.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    getViewDirection: () => {
      throw new Error("unavailable");
    },
    getRotation: () => ({ y: 90 }),
  });
  expect(reader.facingOf(id)).toBe("west");
});
