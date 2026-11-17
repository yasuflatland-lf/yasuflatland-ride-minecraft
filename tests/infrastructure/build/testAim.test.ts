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
        ray: { origin: { x: 1, y: 2, z: 3 }, direction: { x: 1, y: 0, z: 0 } },
        block: { cell: { x: 1, y: 1, z: 3 }, face: "up" },
      };
      const aim = new TestAimReader(base);
      const player = asPlayerId("player");
      const other = asPlayerId("other");
      vi.spyOn(base, "dimensionOf").mockReturnValue(overworld);
      aim.setFacing(player, facing);
      expect(aim.aim(player)).toEqual({
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
