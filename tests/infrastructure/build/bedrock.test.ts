import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, edgePoints } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBlockWorld } from "../../../src/infrastructure/build/bedrock/bedrockBlockWorld";
import { BedrockBuildAnchor } from "../../../src/infrastructure/build/bedrock/bedrockBuildAnchor";
import { BedrockFeedback } from "../../../src/infrastructure/build/bedrock/bedrockFeedback";
import {
  BUILD_MESSAGE,
  LAID_BLOCK_TAG,
} from "../../../src/infrastructure/build/identifiers";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getBlock: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: {
    getEntity: engine.getEntity,
    getDimension: () => ({ getBlock: engine.getBlock }),
  },
  BlockPermutation: { resolve: engine.resolve },
}));
beforeEach(() => vi.resetAllMocks());
const dimension = asDimensionId("minecraft:overworld");
const playerId = asPlayerId("player");
const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -60, max: 200 }),
  z: fc.integer({ min: -100, max: 100 }),
});

it("maps player feet with floor rounding on every axis", () => {
  fc.assert(
    fc.property(
      fc.record({
        x: fc.double({ min: -100, max: 100, noNaN: true }),
        y: fc.double({ min: -60, max: 200, noNaN: true }),
        z: fc.double({ min: -100, max: 100, noNaN: true }),
      }),
      fc.constantFrom("minecraft:overworld", "minecraft:nether"),
      fc.boolean(),
      (location, dimensionId, valid) => {
        engine.getEntity.mockReturnValue({
          typeId: "minecraft:player",
          isValid: valid,
          dimension: { id: dimensionId },
          location,
        });
        expect(new BedrockBuildAnchor().feetOf(playerId)).toEqual(
          valid
            ? {
                dimensionId,
                cell: {
                  x: Math.floor(location.x),
                  y: Math.floor(location.y),
                  z: Math.floor(location.z),
                },
              }
            : undefined,
        );
      },
    ),
  );
});

it("preserves permutation states and refuses protected or laid cells", () => {
  fc.assert(
    fc.property(
      cell,
      fc.boolean(),
      fc.boolean(),
      fc.constantFrom("x", "y", "z"),
      (at, protectedCell, laid, axis) => {
        const state = blockStateOf("minecraft:oak_log", { pillar_axis: axis });
        const permutation = {
          type: { id: state.typeId },
          getAllStates: () => state.states,
        };
        const setPermutation = vi.fn();
        const hasTag = vi.fn(() => laid);
        engine.getBlock.mockReturnValue({
          permutation,
          setPermutation,
          hasTag,
        });
        engine.resolve.mockReturnValue(permutation);
        const isProtected = vi.fn(() => protectedCell);
        const blocks = new BedrockBlockWorld({ isProtected });
        expect(blocks.stateAt(dimension, at)).toEqual(state);
        expect(blocks.materialOf(dimension, at)).toEqual(state);
        expect(blocks.setState(dimension, at, state)).toBe(true);
        expect(engine.resolve).toHaveBeenLastCalledWith(
          state.typeId,
          state.states,
        );
        expect(setPermutation).toHaveBeenCalledWith(permutation);
        expect(blocks.mayEdit(dimension, at)).toBe(!protectedCell && !laid);
        expect(isProtected).toHaveBeenCalledWith(dimension, at);
        if (!protectedCell) expect(hasTag).toHaveBeenCalledWith(LAID_BLOCK_TAG);
      },
    ),
  );
});

it("fails closed for unreadable blocks and rejected permutations", () => {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const at = { x: 0, y: 0, z: 0 };
  for (const get of [
    () => undefined,
    () => {
      throw new Error("unloaded");
    },
  ]) {
    engine.getBlock.mockImplementation(get);
    expect(blocks.stateAt(dimension, at)).toBeUndefined();
    expect(blocks.materialOf(dimension, at)).toBe("refused");
    expect(
      blocks.setState(dimension, at, blockStateOf("minecraft:stone")),
    ).toBe(false);
    expect(blocks.mayEdit(dimension, at)).toBe(false);
  }
  const setPermutation = vi.fn();
  engine.getBlock.mockReturnValue({ setPermutation });
  engine.resolve.mockImplementation(() => {
    throw new Error("invalid state");
  });
  expect(blocks.setState(dimension, at, blockStateOf("invalid"))).toBe(false);
  expect(setPermutation).not.toHaveBeenCalled();
  engine.resolve.mockReturnValue({});
  setPermutation.mockImplementation(() => {
    throw new Error("unloaded");
  });
  expect(blocks.setState(dimension, at, blockStateOf("minecraft:stone"))).toBe(
    false,
  );
});

it("sends translated counts and bounded player-only particles at block centers", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom("selection" as const, "paste" as const),
      fc.nat(),
      (a, b, style, count) => {
        const setActionBar = vi.fn();
        const spawnParticle = vi.fn();
        const player = {
          typeId: "minecraft:player",
          isValid: true,
          dimension: { id: dimension },
          onScreenDisplay: { setActionBar },
          spawnParticle,
        };
        engine.getEntity.mockReturnValue(player);
        const feedback = new BedrockFeedback();
        feedback.showMessage(playerId, "endSet", count);
        expect(setActionBar).toHaveBeenCalledWith({
          translate: BUILD_MESSAGE.endSet,
          with: [String(count)],
        });
        feedback.showMessage(playerId, "tooLarge", count);
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.tooLarge,
          with: [
            String(count),
            String(BUILD_SPEC.maxVolume),
            String(BUILD_SPEC.maxCopyVolume),
          ],
        });
        const box = boxOf(a, b);
        feedback.drawOutline(playerId, dimension, box, style);
        const points = edgePoints(box, BUILD_SPEC.outlineMaxPoints);
        expect(spawnParticle.mock.calls).toEqual(
          points.map((p) => [
            style === "selection"
              ? "minecraft:villager_happy"
              : "minecraft:blue_flame_particle",
            { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 },
          ]),
        );
        spawnParticle.mockClear();
        feedback.drawOutline(
          playerId,
          asDimensionId("minecraft:nether"),
          box,
          style,
        );
        expect(spawnParticle).not.toHaveBeenCalled();
        player.isValid = false;
        setActionBar.mockClear();
        feedback.showMessage(playerId, "selectionCleared");
        feedback.drawOutline(playerId, dimension, box, style);
        expect(setActionBar).not.toHaveBeenCalled();
        expect(spawnParticle).not.toHaveBeenCalled();
      },
    ),
  );
});

it("draws 20 endrod particles on the corner boundary for the owner only", () => {
  fc.assert(
    fc.property(cell, (at) => {
      const spawnParticle = vi.fn();
      const player = {
        typeId: "minecraft:player",
        isValid: true,
        dimension: { id: dimension },
        spawnParticle,
      };
      engine.getEntity.mockReturnValue(player);
      const feedback = new BedrockFeedback();
      feedback.drawCorner(playerId, dimension, at);
      expect(engine.getEntity).toHaveBeenLastCalledWith(playerId);
      expect(spawnParticle).toHaveBeenCalledTimes(20);
      expect(spawnParticle.mock.calls).toEqual(
        cornerMarkerPoints(at).map((point) => ["minecraft:endrod", point]),
      );
      spawnParticle.mockClear();
      feedback.drawCorner(playerId, asDimensionId("minecraft:nether"), at);
      expect(spawnParticle).not.toHaveBeenCalled();
      player.isValid = false;
      feedback.drawCorner(playerId, dimension, at);
      expect(spawnParticle).not.toHaveBeenCalled();
      engine.getEntity.mockReturnValue(undefined);
      feedback.drawCorner(playerId, dimension, at);
      expect(spawnParticle).not.toHaveBeenCalled();
    }),
  );
});

it("stops a corner marker at the first rejected particle without throwing", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 0, max: 19 }),
      (at, successfulSpawns) => {
        const spawnParticle = vi.fn(() => {
          if (spawnParticle.mock.calls.length > successfulSpawns) {
            throw new Error("unloaded");
          }
        });
        engine.getEntity.mockReturnValue({
          typeId: "minecraft:player",
          isValid: true,
          dimension: { id: dimension },
          spawnParticle,
        });
        expect(() =>
          new BedrockFeedback().drawCorner(playerId, dimension, at),
        ).not.toThrow();
        expect(spawnParticle).toHaveBeenCalledTimes(successfulSpawns + 1);
      },
    ),
  );
});

it("refuses air, liquids and data-holding blocks as material", () => {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  for (const typeId of [
    "minecraft:air",
    "minecraft:flowing_water",
    "minecraft:chest",
    "minecraft:lectern",
  ]) {
    engine.getBlock.mockReturnValue({
      permutation: { type: { id: typeId }, getAllStates: () => ({}) },
    });
    expect(blocks.materialOf(dimension, { x: 0, y: 64, z: 0 })).toBe("refused");
  }
});
