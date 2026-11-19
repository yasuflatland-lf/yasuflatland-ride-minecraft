import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  type HeightStepFlow,
  heightStepBox,
} from "../../../src/domain/build/flow/flow";
import type { HeightStepKind } from "../../../src/domain/build/volume/kind";
import { asDimensionId } from "../../../src/domain/shared/ids";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimensionId = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");

const heightStepKind = fc.constantFrom<HeightStepKind>(
  "gable",
  "hip",
  "cube",
  "cylinder",
  "sphere",
);

it("grows the inclusive height-step box from its base without changing the flow", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.integer({ min: 1, max: 400 }),
      heightStepKind,
      fc.boolean(),
      (a, b, height, kind, heightLocked) => {
        const base = boxOf(a, b);
        const flow: HeightStepFlow = {
          kind: "heightStep",
          dimensionId,
          base,
          from: a,
          heightedKind: kind,
          previous: height,
          heightLocked,
          material: stone,
        };
        const before = structuredClone(flow);
        const box = heightStepBox(flow);
        expect(box.min).toEqual(base.min);
        expect(box.max.x).toBe(base.max.x);
        expect(box.max.z).toBe(base.max.z);
        expect(box.max.y - box.min.y + 1).toBe(height);
        expect(flow).toEqual(before);
      },
    ),
  );
});
