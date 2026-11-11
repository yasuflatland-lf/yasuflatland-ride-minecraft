import { beforeEach, expect, it, vi } from "vitest";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { BedrockGroundProbe } from "../../../src/infrastructure/build/bedrock/bedrockGroundProbe";

const engine = vi.hoisted(() => ({ getBlock: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: { getDimension: engine.getDimension },
}));
const dimension = asDimensionId("minecraft:nether");
const probe = new BedrockGroundProbe();
const block = (typeId: string) => ({
  typeId,
  isAir: typeId === "minecraft:air",
  isLiquid: typeId.includes("water") || typeId.includes("lava"),
});
beforeEach(() => {
  vi.resetAllMocks();
  engine.getDimension.mockReturnValue({ getBlock: engine.getBlock });
});

it("starts inclusively and skips liquids and replaceable cover to find solid ground", () => {
  const cover = [
    "air",
    "water",
    "flowing_water",
    "lava",
    "flowing_lava",
    "short_grass",
    "tall_grass",
    "snow_layer",
    "poppy",
    "vine",
    "torchflower",
    "pitcher_plant",
  ];
  engine.getBlock.mockImplementation(({ y }) =>
    block(`minecraft:${cover[100 - y] ?? "stone"}`),
  );
  expect(probe.topSolidY(dimension, 3, 4, 100)).toBe(100 - cover.length);
  expect(engine.getDimension).toHaveBeenCalledWith(dimension);
  expect(engine.getBlock.mock.calls[0]).toEqual([{ x: 3, y: 100, z: 4 }]);
  engine.getBlock.mockReturnValue(block("minecraft:stone"));
  expect(probe.topSolidY(dimension, 3, 4, 100)).toBe(100);
});

it("includes the last cell of the search budget but never searches past it", () => {
  engine.getBlock.mockImplementation(({ y }) =>
    block(
      y === 100 - BUILD_SPEC.groundSearchDepth + 1
        ? "minecraft:stone"
        : "minecraft:air",
    ),
  );
  expect(probe.topSolidY(dimension, 0, 0, 100)).toBe(
    100 - BUILD_SPEC.groundSearchDepth + 1,
  );
  engine.getBlock.mockClear();
  engine.getBlock.mockReturnValue(block("minecraft:air"));
  expect(probe.topSolidY(dimension, 0, 0, 100)).toBeUndefined();
  expect(engine.getBlock).toHaveBeenCalledTimes(BUILD_SPEC.groundSearchDepth);
});

it.each(["missing", "throwing"])(
  "treats an unreadable cell as no ground for the entire column: %s",
  (mode) => {
    engine.getBlock.mockImplementation(({ y }) => {
      if (y === 99) {
        if (mode === "throwing") throw new Error("Unloaded");
        return undefined;
      }
      return block(y === 100 ? "minecraft:air" : "minecraft:stone");
    });
    expect(probe.topSolidY(dimension, 0, 0, 100)).toBeUndefined();
    expect(engine.getBlock).toHaveBeenCalledTimes(2);
  },
);
