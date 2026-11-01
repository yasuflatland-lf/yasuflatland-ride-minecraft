import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, center, edgePoints } from "../../../src/domain/build/box";
import {
  type BuildFlow,
  chooseHeighted,
  copyBoxOf,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { contentsMenu, shapeMenu } from "../../../src/domain/build/flow/menu";
import { shapeOf } from "../../../src/domain/build/shape/shape";
import { copyVolume } from "../../../src/domain/build/volume/copy";
import { cubeVolume } from "../../../src/domain/build/volume/cube";
import { volumeOf } from "../../../src/domain/build/volume/geometry";
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

it("offers Copy immediately before Cancel and starts its height step exactly for horizontal rectangles", () => {
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
      expect(entries.slice(-2)).toEqual(["copy", "cancel"]);
      expect(entries.filter((id) => id === "copy")).toHaveLength(1);
      expect(copyBoxOf(endpoint)).toEqual(boxOf(a, b));
      const shape = shapeOf(a, b);
      const chosen = chooseHeighted(endpoint, "copy");
      if (shape.kind === "rect" && shape.flat === "y") {
        expect(chosen).toEqual({
          kind: "heightStep",
          dimensionId,
          base: boxOf(a, b),
          from,
          heightedKind: "copy",
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
        expect(chooseHeighted(flow, "copy")).toBe(flow);
        expect(copyBoxOf(flow)).toBeUndefined();
      }
    }),
  );
});

it("registers Copy with the same height cap and grown-box wireframe as Cube", () => {
  expect(volumeOf("copy")).toBe(copyVolume);
  fc.assert(
    fc.property(
      cell,
      cell,
      coordinate,
      fc.integer({ min: 0, max: 200 }),
      (a, b, top, budget) => {
        const base = boxOf(a, b);
        const cap = copyVolume.maxHeight(base, top);
        expect(cap).toBe(Math.max(1, top - base.min.y + 1));
        expect(cap).toBe(cubeVolume.maxHeight(base, top));
        for (const height of [1, cap]) {
          const spec = { base, height, kind: "copy" as const };
          const grown = {
            min: base.min,
            max: { ...base.max, y: base.min.y + height - 1 },
          };
          expect(copyVolume.wireframe(spec, budget)).toEqual(
            edgePoints(grown, budget).map(center),
          );
          expect(copyVolume.wireframe(spec, budget)).toEqual(
            cubeVolume.wireframe({ ...spec, kind: "cube" }, budget),
          );
        }
      },
    ),
  );
});
