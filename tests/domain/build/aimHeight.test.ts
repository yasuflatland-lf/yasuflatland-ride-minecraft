import fc from "fast-check";
import { expect, it } from "vitest";
import { aimedHeight } from "../../../src/domain/build/aim/height";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";

it("keeps the Copy outline top layer at the looked-at block's layer", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: BUILD_SPEC.worldBottomY, max: BUILD_SPEC.worldTopY }),
      fc.nat(100),
      fc.integer({ min: 0, max: 1023 }),
      (baseY, index, fraction) => {
        const flow = chooseHeighted(
          tapAir(
            tapBlock(
              { kind: "idle" },
              asDimensionId("minecraft:overworld"),
              { x: 0, y: baseY, z: 0 },
              blockStateOf("minecraft:stone"),
            ),
            { x: 3, y: baseY, z: 3 },
          ),
          "copy",
        );
        expect(flow.kind).toBe("heightStep");
        if (flow.kind !== "heightStep")
          throw new Error("Expected Copy height step");
        expect(flow.heightLocked).toBe(false);
        const k = Math.min(index, BUILD_SPEC.worldTopY - baseY);
        const lookY = baseY + k + fraction / 1024;
        const height = aimedHeight(flow, {
          origin: { x: -8, y: lookY, z: 2 },
          direction: { x: 1, y: 0, z: 0 },
        });
        expect(height).toBe(k + 1);
        expect(flow.base.min.y + height - 1).toBe(Math.floor(lookY));
      },
    ),
  );
});
