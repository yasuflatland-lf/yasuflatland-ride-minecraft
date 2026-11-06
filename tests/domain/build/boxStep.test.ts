import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  type BuildFlow,
  chooseHeighted,
  type HeightStepFlow,
  heightStepBox,
  selectionBoxOf,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { contentsMenu, shapeMenu } from "../../../src/domain/build/flow/menu";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { boxStepVolume } from "../../../src/domain/build/volume/boxStep";
import { cubeVolume } from "../../../src/domain/build/volume/cube";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
import {
  boxStepLimit,
  type HeightStepKind,
  isBoxStepKind,
} from "../../../src/domain/build/volume/kind";
import { asDimensionId } from "../../../src/domain/shared/ids";

const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const offset = fc.record({
  x: fc.integer({ min: 0, max: 10 }),
  y: fc.integer({ min: 0, max: 10 }),
  z: fc.integer({ min: 0, max: 10 }),
});
const dimensionId = asDimensionId("minecraft:overworld");
const stone = blockStateOf("minecraft:stone");

it.each(["copy", "cut"] as const)(
  "offers Cut before Copy and starts %s height only for horizontal rectangles",
  (kind) => {
    fc.assert(
      fc.property(cell, offset, fc.boolean(), (a, delta, reverse) => {
        const b = { x: a.x + delta.x, y: a.y + delta.y, z: a.z + delta.z };
        const from = reverse ? b : a;
        const to = reverse ? a : b;
        const endpoint = tapAir(
          tapBlock({ kind: "idle" }, dimensionId, from, stone),
          to,
        );
        const entries = shapeMenu(endpoint).map((entry) => entry.id);
        expect(entries.slice(-3)).toEqual(["cut", "copy", "cancel"]);
        expect(entries.filter((id) => id === kind)).toHaveLength(1);
        expect(selectionBoxOf(endpoint)).toEqual(boxOf(a, b));
        const shape = shapeOf(a, b);
        const chosen = chooseHeighted(endpoint, kind);
        if (shape.kind === "rect" && shape.flat === "y") {
          expect(chosen).toEqual({
            kind: "heightStep",
            dimensionId,
            base: boxOf(a, b),
            from,
            heightedKind: kind,
            previous: 1,
            heightLocked: false,
            material: stone,
          });
          expect(contentsMenu(chosen)).toEqual([]);
        } else expect(chosen).toBe(endpoint);
        for (const flow of [
          { kind: "idle" },
          tapBlock({ kind: "idle" }, dimensionId, from, stone),
          chosen.kind === "heightStep"
            ? chosen
            : { kind: "pasteAim", skipAir: false },
        ] as BuildFlow[]) {
          expect(chooseHeighted(flow, kind)).toBe(flow);
          expect(selectionBoxOf(flow)).toBeUndefined();
        }
      }),
    );
  },
);

it("registers Copy with the same height cap and grown-box wireframe as Cube", () => {
  expect(volumeOf("copy")).toBe(boxStepVolume);
  expect(volumeOf("cut")).toBe(boxStepVolume);
  fc.assert(
    fc.property(
      cell,
      cell,
      coordinate,
      fc.integer({ min: 0, max: 200 }),
      (a, b, top, budget) => {
        const base = boxOf(a, b);
        const cap = boxStepVolume.maxHeight(base, top);
        expect(cap).toBe(Math.max(1, top - base.min.y + 1));
        expect(cap).toBe(cubeVolume.maxHeight(base, top));
        for (const height of [1, cap]) {
          const spec = { base, height, kind: "copy" as const };
          expect(boxStepVolume.wireframe(spec, budget)).toEqual(
            cubeVolume.wireframe({ ...spec, kind: "cube" }, budget),
          );
        }
      },
    ),
  );
});

const heightStepKind = fc.constantFrom<HeightStepKind>(
  "copy",
  "cut",
  "gable",
  "hip",
  "cube",
  "cylinder",
);

it("identifies box steps among all height-step kinds and supplies their limit", () => {
  fc.assert(
    fc.property(heightStepKind, (kind) => {
      expect(isBoxStepKind(kind)).toBe(kind === "copy" || kind === "cut");
      if (isBoxStepKind(kind))
        expect(boxStepLimit(kind)).toBe(BUILD_SPEC.maxCopyVolume);
    }),
  );
});

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
