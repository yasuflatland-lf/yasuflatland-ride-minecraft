import { beforeEach, expect, it, vi } from "vitest";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { TOILET_SPEC } from "../../../src/domain/resort/shows";
import { BedrockShowSound } from "../../../src/infrastructure/resort/bedrock/bedrockShowSound";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));
beforeEach(() => vi.clearAllMocks());
it("plays at the entity location in its dimension", () => {
  const playSound = vi.fn();
  const location = { x: 10.5, y: 64, z: 20.5 };
  game.getEntity.mockReturnValue({
    isValid: true,
    dimension: { playSound },
    location,
  });
  new BedrockShowSound().playAt(
    TOILET_SPEC.flushSound,
    asFurnitureId("toilet"),
  );
  expect(game.getEntity).toHaveBeenCalledExactlyOnceWith("toilet");
  expect(playSound).toHaveBeenCalledExactlyOnceWith(
    TOILET_SPEC.flushSound,
    location,
  );
});
it("silences missing or invalid entities and engine errors", () => {
  const sound = new BedrockShowSound();
  const playSound = vi.fn();
  for (const entity of [
    undefined,
    { isValid: false, dimension: { playSound } },
  ]) {
    game.getEntity.mockReturnValue(entity);
    sound.playAt(TOILET_SPEC.flushSound, asFurnitureId("toilet"));
  }
  expect(playSound).not.toHaveBeenCalled();
  game.getEntity.mockImplementation(() => {
    throw Error("unloaded");
  });
  expect(() =>
    sound.playAt(TOILET_SPEC.flushSound, asFurnitureId("toilet")),
  ).not.toThrow();
  game.getEntity.mockReturnValue({
    isValid: true,
    dimension: {
      playSound: () => {
        throw Error("unloaded");
      },
    },
  });
  expect(() =>
    sound.playAt(TOILET_SPEC.flushSound, asFurnitureId("toilet")),
  ).not.toThrow();
});
