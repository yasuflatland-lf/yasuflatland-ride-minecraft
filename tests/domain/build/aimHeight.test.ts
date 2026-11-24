import fc from "fast-check";
import { expect, it } from "vitest";
import { aimedHeight } from "../../../src/domain/build/aim/height";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/heightFlow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { NETHER_RANGE, OVERWORLD_RANGE } from "../../helpers/buildHeightRange";

it.each([OVERWORLD_RANGE, NETHER_RANGE])(
  "aims from the endpoint height and caps the live outline by world top and copy volume in $minY..$maxY",
  (range) => {
    fc.assert(
      fc.property(
        fc.integer({ min: range.minY, max: range.maxY }),
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
              range,
            ),
            to,
            range,
          );
          expect(flow.kind).toBe("baseHeight");
          if (flow.kind !== "baseHeight")
            throw new Error("Expected live height");
          const cap = Math.max(
            1,
            Math.min(
              range.maxY - baseY + 1,
              Math.floor(BUILD_SPEC.maxCopyVolume / (x * z)),
            ),
          );
          expect(flow.previous).toBe(Math.min(topY - baseY + 1, cap));
          const length = Math.hypot(64, rise);
          const height = aimedHeight(
            flow,
            {
              origin: { x: x / 2 - 64, y: eyeY, z: z / 2 },
              direction: { x: 64 / length, y: rise / length, z: 0 },
            },
            range,
          );
          expect(height).toBe(
            Math.max(1, Math.min(topY - baseY + 1 + rise, cap)),
          );
        },
      ),
    );
  },
);
