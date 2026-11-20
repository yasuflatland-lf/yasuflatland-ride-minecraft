import { expect, it, vi } from "vitest";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { isSolidTop } from "../../../src/infrastructure/shared/blocks";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getBlockFromRay: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  world: { getDimension: game.getDimension },
}));

const dimension = asDimensionId("overworld");
const cell = { x: 1, y: 2, z: 3 };
const fullTop = {
  face: "Up",
  faceLocation: { y: 0 },
  block: { location: cell },
};

it.each([
  ["full top", fullTop, true],
  ["bottom slab", { ...fullTop, faceLocation: { y: 0.5 } }, false],
  ["side face", { ...fullTop, face: "West" }, false],
  ["other cell", { ...fullTop, block: { location: { ...cell, y: 1 } } }, false],
  ["miss", undefined, false],
] as const)("checks solid support for a %s", (_, hit, expected) => {
  game.getDimension.mockReturnValue({ getBlockFromRay: game.getBlockFromRay });
  game.getBlockFromRay.mockReturnValue(hit);
  expect(isSolidTop(dimension, cell)).toBe(expected);
  expect(game.getDimension).toHaveBeenCalledWith(dimension);
  expect(game.getBlockFromRay).toHaveBeenCalledWith(
    { x: 1.5, y: 3.5, z: 3.5 },
    { x: 0, y: -1, z: 0 },
    {
      maxDistance: 1,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    },
  );
});

it("refuses support when the dimension lookup throws", () => {
  game.getDimension.mockImplementationOnce(() => {
    throw new Error("unknown dimension");
  });
  expect(isSolidTop(dimension, cell)).toBe(false);
});
