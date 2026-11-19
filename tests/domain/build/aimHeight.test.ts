import fc from "fast-check";
import { expect, it } from "vitest";
import { aimedHeight } from "../../../src/domain/build/aim/height";
import { blockStateOf } from "../../../src/domain/build/blockState";
import {
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";

it("aims from the endpoint height and caps the live outline by world top and copy volume", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: BUILD_SPEC.worldBottomY, max: BUILD_SPEC.worldTopY }),
      fc.integer({ min: 2, max: 200 }),
      fc.integer({ min: 2, max: 200 }),
      fc.nat(30),
      fc.integer({ min: -512, max: 512 }),
      fc.integer(),
      fc.boolean(),
      (baseY, x, z, layers, rise, eyeY, reverse) => {
        const topY = baseY + layers;
        const min = { x: 0, y: baseY, z: 0 };
        const max = { x: x - 1, y: topY, z: z - 1 };
        const from = reverse ? max : min;
        const to = reverse ? min : max;
        const flow = tapAir(
          tapBlock(
            { kind: "idle" },
            asDimensionId("minecraft:overworld"),
            from,
            blockStateOf("minecraft:stone"),
          ),
          to,
        );
        expect(flow.kind).toBe("baseHeight");
        if (flow.kind !== "baseHeight") throw new Error("Expected live height");
        const cap = Math.max(
          1,
          Math.min(
            BUILD_SPEC.worldTopY - baseY + 1,
            Math.floor(BUILD_SPEC.maxCopyVolume / (x * z)),
          ),
        );
        expect(flow.previous).toBe(Math.min(topY - baseY + 1, cap));
        const length = Math.hypot(64, rise);
        const height = aimedHeight(flow, {
          origin: { x: x / 2 - 64, y: eyeY, z: z / 2 },
          direction: { x: 64 / length, y: rise / length, z: 0 },
        });
        expect(height).toBe(
          Math.max(1, Math.min(topY - baseY + 1 + rise, cap)),
        );
      },
    ),
  );
});
