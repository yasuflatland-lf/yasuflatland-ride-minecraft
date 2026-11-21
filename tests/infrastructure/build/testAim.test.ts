import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  FACINGS,
  facingVector,
} from "../../../src/domain/build/rotation/facing";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { TestAimReader } from "../../../src/infrastructure/build/bedrock/handlers/testAim";
import { FakeAimReader, overworld } from "../../application/build/fakes";

it("overrides only the requested player's gaze with air aim until cleared", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACINGS), (facing) => {
      const base = new FakeAimReader();
      base.target = {
        input: "pointer",
        ray: { origin: { x: 1, y: 2, z: 3 }, direction: { x: 1, y: 0, z: 0 } },
        block: { cell: { x: 1, y: 1, z: 3 }, face: "up" },
      };
      const aim = new TestAimReader(base);
      const player = asPlayerId("player");
      const other = asPlayerId("other");
      vi.spyOn(base, "dimensionOf").mockReturnValue(overworld);
      aim.setFacing(player, facing);
      expect(aim.aim(player)).toEqual({
        input: "pointer",
        ray: {
          origin: base.target.ray.origin,
          direction: facingVector(facing),
        },
      });
      expect(aim.aim(other)).toEqual(base.target);
      expect(aim.dimensionOf(player)).toBe(overworld);
      aim.setFacing(player, undefined);
      expect(aim.aim(player)).toEqual(base.target);
      base.target = undefined;
      aim.setFacing(player, facing);
      expect(aim.aim(player)).toBeUndefined();
    }),
  );
});

it("overrides the hit with an upward face until the test aim is cleared", () => {
  const base = new FakeAimReader();
  const ray = { origin: { x: 1, y: 2, z: 3 }, direction: { x: 1, y: 0, z: 0 } };
  base.target = {
    input: "pointer",
    ray,
    block: { cell: { x: 1, y: 1, z: 3 }, face: "north" },
  };
  const aim = new TestAimReader(base);
  const player = asPlayerId("player");
  const cell = { x: -10, y: 9, z: 7 };
  aim.setHit(player, cell);
  expect(aim.aim(player)).toEqual({
    input: "pointer",
    ray,
    block: { cell, face: "up" },
  });
  expect(aim.aim(asPlayerId("other"))).toEqual(base.target);
  aim.setHit(player, undefined);
  expect(aim.aim(player)).toEqual(base.target);
});
