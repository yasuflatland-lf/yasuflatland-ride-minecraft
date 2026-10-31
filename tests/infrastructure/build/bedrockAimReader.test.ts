import { beforeEach, expect, it, vi } from "vitest";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockAimReader } from "../../../src/infrastructure/build/bedrock/bedrockAimReader";

const engine = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  GameMode: {},
  world: { getEntity: engine.getEntity },
}));

const id = asPlayerId("p");
const ray = {
  origin: { x: 1, y: 65.6, z: 2 },
  direction: { x: 0, y: 0, z: 1 },
};
function player() {
  return {
    typeId: "minecraft:player",
    isValid: true,
    getHeadLocation: () => ray.origin,
    getViewDirection: () => ray.direction,
    getBlockFromViewDirection: vi.fn(() => undefined as unknown),
  };
}
beforeEach(() => engine.getEntity.mockReset());

it("reads the head ray and optional block hit within build reach", () => {
  const p = player();
  engine.getEntity.mockReturnValue(p);
  const reader = new BedrockAimReader();
  expect(reader.aim(id)).toEqual({ ray, block: undefined });
  const cell = { x: 1, y: 65, z: 8 };
  p.getBlockFromViewDirection.mockReturnValue({
    block: { location: cell },
    face: "North",
  });
  expect(reader.aim(id)).toEqual({ ray, block: { cell, face: "North" } });
  expect(engine.getEntity).toHaveBeenCalledWith(id);
  expect(p.getBlockFromViewDirection).toHaveBeenCalledWith({
    maxDistance: BUILD_SPEC.reach,
  });
});

it("returns undefined for missing, invalid, non-player, and throwing handles", () => {
  const reader = new BedrockAimReader();
  for (const entity of [
    undefined,
    { ...player(), isValid: false },
    { ...player(), typeId: "minecraft:pig" },
  ]) {
    engine.getEntity.mockReturnValue(entity);
    expect(reader.aim(id)).toBeUndefined();
  }
  engine.getEntity.mockImplementation(() => {
    throw new Error("malformed id");
  });
  expect(reader.aim(id)).toBeUndefined();
  const p = player();
  engine.getEntity.mockReturnValue(p);
  p.getBlockFromViewDirection.mockImplementation(() => {
    throw new Error("gone");
  });
  expect(reader.aim(id)).toBeUndefined();
});
