import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  FACINGS,
  facingVector,
} from "../../../src/domain/build/rotation/facing";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import {
  type AimOverride,
  BedrockAimReader,
} from "../../../src/infrastructure/build/bedrock/bedrockAimReader";
import { TestAimReader } from "../../../src/infrastructure/build/testHooks/testAim";
import { overworld } from "../../application/build/fakes";

const engine = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  InputMode: { Touch: "Touch" },
  Direction: { Up: "Up", North: "North" },
  world: { getEntity: engine.getEntity },
}));

function setup(face: "Up" | "North") {
  const ray = { origin: { x: 1, y: 2, z: 3 }, direction: { x: 1, y: 0, z: 0 } };
  const cell = { x: 1, y: 1, z: 3 };
  const player = {
    typeId: "minecraft:player",
    isValid: true,
    dimension: { id: overworld },
    getHeadLocation: () => ray.origin,
    getViewDirection: () => ray.direction,
    getBlockFromViewDirection: () => ({ block: { location: cell }, face }),
  };
  engine.getEntity.mockReturnValue(player);
  const overrides = new Map<PlayerId, AimOverride>();
  const reader = new BedrockAimReader(overrides);
  return { reader, aim: new TestAimReader(overrides), ray, player };
}

it("overrides only the requested player's gaze with air aim until cleared", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACINGS), (facing) => {
      const { reader, aim, ray, player: entity } = setup("Up");
      const player = asPlayerId("player");
      const other = asPlayerId("other");
      const base = reader.aim(player);
      aim.setFacing(player, facing);
      expect(reader.aim(player)).toEqual({
        input: "pointer",
        ray: {
          origin: ray.origin,
          direction: facingVector(facing),
        },
      });
      expect(reader.aim(other)).toEqual(base);
      expect(reader.dimensionOf(player)).toBe(overworld);
      aim.setFacing(player, undefined);
      expect(reader.aim(player)).toEqual(base);
      entity.isValid = false;
      aim.setFacing(player, facing);
      expect(reader.aim(player)).toBeUndefined();
    }),
  );
});

it("overrides the hit with an upward face until the test aim is cleared", () => {
  const { reader, aim, ray } = setup("North");
  const player = asPlayerId("player");
  const base = reader.aim(player);
  const cell = cellOf({ x: -10, y: 9, z: 7 });
  aim.setHit(player, cell);
  expect(reader.aim(player)).toEqual({
    input: "pointer",
    ray,
    block: { cell, face: "up" },
  });
  expect(reader.aim(asPlayerId("other"))).toEqual(base);
  aim.setHit(player, undefined);
  expect(reader.aim(player)).toEqual(base);
});
