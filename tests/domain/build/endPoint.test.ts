import { expect, it } from "vitest";
import {
  aimedEndPoint,
  endPointReach,
  virtualAimedEndPoint,
} from "../../../src/domain/build/aim/endPoint";
import { BUILD_SPEC } from "../../../src/domain/build/spec";

const point1 = { x: 4, y: 60, z: 2 };
const end = { x: 4, y: 62, z: 3 };
const aim = {
  ray: {
    origin: { x: 0.5, y: 62.5, z: 3.5 },
    direction: { x: 1, y: 0, z: 0 },
  },
  input: "pointer",
} as const;
const block = { cell: { x: 3, y: 62, z: 3 }, face: "west" } as const;

it("takes the block hit as the aimed end point when present", () => {
  expect(aimedEndPoint(point1, { ...aim, block })).toEqual(block.cell);
});

it("uses the virtual point when there is no block hit", () => {
  expect(aimedEndPoint(point1, aim)).toEqual(end);
});

it("computes the virtual point even when the ray hits a block", () => {
  expect(virtualAimedEndPoint(point1, { ...aim, block })).toEqual(end);
});

it.each(["pointer", "touch"] as const)(
  "uses build reach for %s input",
  (input) => {
    expect(endPointReach(input)).toBe(BUILD_SPEC.reach);
  },
);
