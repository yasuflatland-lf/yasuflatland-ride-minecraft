import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
import {
  inDimension,
  selectionOf,
  withBox,
} from "../../../src/domain/build/selection";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { confirmEndpointHeight } from "../../support/buildSelection";

const cell = fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() });
const dimensionId = asDimensionId("minecraft:overworld");
const material = blockStateOf("minecraft:oak_log", { pillar_axis: "x" });
const origin = { x: 0, y: 0, z: 0 };

it("replaces the box while retaining the dimension and material", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.string(),
      fc.string(),
      (a, b, dimension, typeId) => {
        const originalBox = boxOf(a, a);
        const selection = selectionOf(
          asDimensionId(dimension),
          originalBox,
          blockStateOf(typeId),
        );
        const box = boxOf(a, b);
        const result = withBox(selection, box);
        expect(result.box).toEqual(box);
        expect(result.dimensionId).toBe(selection.dimensionId);
        expect(result.material).toBe(selection.material);
        expect(selection.box).toEqual(originalBox);
      },
    ),
  );
});

it("uses inclusive bounds for both endpoint orders", () => {
  fc.assert(
    fc.property(cell, cell, (a, b) => {
      const expected = { dimensionId, material, box: boxOf(a, b) };
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const) {
        const flow = confirmEndpointHeight(
          tapAir(tapBlock({ kind: "idle" }, dimensionId, from, material), to),
        );
        if (flow.kind !== "selected") throw new Error("Missing selection");
        expect(flow.selection).toEqual(expected);
      }
    }),
  );
});

it("freezes the selection and its box corners", () => {
  const selection = selectionOf(dimensionId, boxOf(origin, origin), material);
  for (const value of [
    selection,
    selection.box,
    selection.box.min,
    selection.box.max,
  ])
    expect(Object.isFrozen(value)).toBe(true);
});

it("matches only the selected dimension", () => {
  const selection = selectionOf(dimensionId, boxOf(origin, origin), material);
  expect(inDimension(selection, dimensionId)).toBe(true);
  expect(inDimension(selection, asDimensionId("minecraft:nether"))).toBe(false);
});
