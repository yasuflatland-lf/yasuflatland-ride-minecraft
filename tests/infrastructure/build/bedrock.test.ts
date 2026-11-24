import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { cornerMarkerPoints } from "../../../src/domain/build/cornerMarker";
import type { PreviewSet } from "../../../src/domain/build/preview/preview";
import { boxOutline } from "../../../src/domain/build/preview/preview";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { BedrockBlockWorld } from "../../../src/infrastructure/build/bedrock/bedrockBlockWorld";
import { BedrockFeedback } from "../../../src/infrastructure/build/bedrock/bedrockFeedback";
import {
  BUILD_MESSAGE,
  LAID_BLOCK_TAG,
} from "../../../src/infrastructure/build/identifiers";
import { recordMessages } from "../../../src/infrastructure/build/testHooks/recordMessages";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getBlock: vi.fn(),
  resolve: vi.fn(),
  heightRange: { min: -64, max: 320 },
  getDimension: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: {
    getEntity: engine.getEntity,
    getDimension: engine.getDimension,
  },
  BlockPermutation: { resolve: engine.resolve },
  MolangVariableMap: class {
    readonly colors: Record<string, unknown> = {};

    setColorRGB(name: string, color: unknown): void {
      this.colors[name] = color;
    }
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  engine.getDimension.mockReturnValue({
    getBlock: engine.getBlock,
    heightRange: engine.heightRange,
  });
});
const dimension = asDimensionId("minecraft:overworld");
const playerId = asPlayerId("player");
const cell = fc.record({
  x: fc.integer({ min: -100, max: 100 }),
  y: fc.integer({ min: -60, max: 200 }),
  z: fc.integer({ min: -100, max: 100 }),
});

function preview(part: Partial<PreviewSet>): PreviewSet {
  return {
    startMarker: [],
    shape: [],
    endMarker: [],
    sharedMarker: [],
    roof: [],
    stairs: [],
    paste: [],
    pasteVertical: [],
    ...part,
  };
}

it("keeps all production feedback calls identical with recording enabled", () => {
  const size = fc.record({ x: fc.nat(), y: fc.nat(), z: fc.nat() });
  fc.assert(
    fc.property(
      fc.record({
        id: fc.string(),
        message: fc.constantFrom("endSet", "building", "undoDonePartial"),
        count: fc.option(fc.nat(), { nil: undefined }),
        material: fc.option(fc.string().map(blockStateOf), { nil: undefined }),
        skippedCount: fc.option(fc.nat(), { nil: undefined }),
        size,
        aiming: fc.option(fc.boolean(), { nil: undefined }),
        blockCount: fc.nat(),
        degrees: fc.constantFrom(0, 90, 180, 270),
        isSneaking: fc.boolean(),
        points: fc.array(cell, { maxLength: 4 }),
        previewDimension: fc.option(fc.constant(dimension), { nil: undefined }),
      }),
      (input) => {
        const calls = { actionBar: vi.fn(), chat: vi.fn(), particle: vi.fn() };
        engine.getEntity.mockReturnValue({
          typeId: "minecraft:player",
          isValid: true,
          dimension: { id: dimension },
          isSneaking: input.isSneaking,
          onScreenDisplay: { setActionBar: calls.actionBar },
          sendMessage: calls.chat,
          spawnParticle: calls.particle,
        });
        const id = asPlayerId(input.id);
        const mode = {
          kind: "pasteReady" as const,
          size: input.size,
          blockCount: input.blockCount,
          degrees: input.degrees,
        };
        const showFeedback = (feedback: BedrockFeedback) => {
          feedback.showMessage(
            id,
            input.message,
            input.count,
            input.material,
            input.skippedCount,
          );
          feedback.showMode(id, mode);
          feedback.showUndoHint(id);
          feedback.showSize(id, input.size, input.aiming);
          feedback.drawPreview(
            id,
            input.previewDimension,
            preview({ startMarker: input.points, paste: input.points }),
          );
        };

        showFeedback(new BedrockFeedback());
        const productionCalls = [
          calls.actionBar.mock.calls.slice(),
          calls.chat.mock.calls.slice(),
          calls.particle.mock.calls.slice(),
        ];
        for (const call of Object.values(calls)) call.mockClear();

        const feedback = new BedrockFeedback();
        const recorded = recordMessages(feedback);
        const onMessage = vi.fn();
        feedback.listeners.add({ onMessage });
        showFeedback(feedback);

        expect([
          calls.actionBar.mock.calls,
          calls.chat.mock.calls,
          calls.particle.mock.calls,
        ]).toEqual(productionCalls);
        expect(calls.actionBar).toHaveBeenLastCalledWith({
          translate: input.aiming
            ? BUILD_MESSAGE.heightAimSize
            : BUILD_MESSAGE.heightSize,
          with: [
            String(input.size.x),
            String(input.size.y),
            String(input.size.z),
          ],
        });
        expect(onMessage).toHaveBeenCalledExactlyOnceWith(
          id,
          input.message,
          input.count,
          input.material,
          input.skippedCount,
        );
        expect(recorded.last(id)).toEqual({
          message: input.message,
          count: input.count,
          skippedCount: input.skippedCount,
        });
        expect(recorded.lastMode(id)).toEqual(mode);
        expect(recorded.hints(id)).toBe(1);
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
        expect(blocks.stateAt(dimension, cellOf(at))).toEqual(state);
        expect(blocks.materialOf(dimension, cellOf(at))).toEqual(state);
        expect(blocks.setState(dimension, cellOf(at), state)).toBe(true);
        expect(engine.resolve).toHaveBeenLastCalledWith(
          state.typeId,
          state.states,
        );
        expect(setPermutation).toHaveBeenCalledWith(permutation);
        expect(blocks.mayEdit(dimension, cellOf(at))).toBe(
          !protectedCell && !laid,
        );
        expect(isProtected).toHaveBeenCalledWith(dimension, at);
        if (!protectedCell) expect(hasTag).toHaveBeenCalledWith(LAID_BLOCK_TAG);
      },
    ),
  );
});

it("checks only space protection for snapshot restoration without reading blocks", () => {
  fc.assert(
    fc.property(cell, fc.boolean(), (at, protectedCell) => {
      const isProtected = vi.fn(() => protectedCell);
      const blocks = new BedrockBlockWorld({ isProtected });
      expect(blocks.mayRestore(dimension, cellOf(at))).toBe(!protectedCell);
      expect(isProtected).toHaveBeenCalledExactlyOnceWith(dimension, at);
      expect(engine.getDimension).not.toHaveBeenCalled();
      expect(engine.getBlock).not.toHaveBeenCalled();
    }),
  );
});

it("reports air only when the engine can read an air block", () => {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const at = cellOf({ x: 0, y: 0, z: 0 });
  engine.getBlock.mockReturnValue({ isAir: true });
  expect(blocks.isAir(dimension, at)).toBe(true);
  engine.getBlock.mockReturnValue({ isAir: false });
  expect(blocks.isAir(dimension, at)).toBe(false);
});

it("fails closed for unreadable blocks and rejected permutations", () => {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const at = cellOf({ x: 0, y: 0, z: 0 });
  for (const get of [
    () => undefined,
    () => {
      throw new Error("unloaded");
    },
  ]) {
    engine.getBlock.mockImplementation(get);
    expect(blocks.stateAt(dimension, at)).toBeUndefined();
    expect(blocks.isAir(dimension, at)).toBe(false);
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
        feedback.showMessage(playerId, "building", undefined, {
          typeId: "minecraft:stone",
          states: {},
        });
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.building,
          with: { rawtext: [{ translate: "tile.stone.name" }] },
        });
        feedback.showMessage(playerId, "undoDonePartial", count, undefined, 2);
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.undoDonePartial,
          with: [String(count), "2"],
        });
        feedback.showMessage(playerId, "undoDonePartial");
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.undoDonePartial,
          with: ["0", "0"],
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
        feedback.showSize(playerId, { x: 9, y: 12, z: 5 });
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.heightSize,
          with: ["9", "12", "5"],
        });
        feedback.showMode(playerId, {
          kind: "pasteReady",
          size: { x: 9, y: 12, z: 5 },
          blockCount: count,
          degrees: 270,
        });
        expect(setActionBar).toHaveBeenLastCalledWith({
          translate: BUILD_MESSAGE.pasteReady,
          with: ["9", "12", "5", String(count), "270"],
        });
        for (const sneaking of [false, true]) {
          Object.assign(player, { isSneaking: sneaking });
          feedback.showMode(playerId, {
            kind: "pasteReady",
            size: { x: 9, y: 12, z: 5 },
            blockCount: count,
            degrees: 270,
          });
          const line = {
            translate: BUILD_MESSAGE.pasteReady,
            with: ["9", "12", "5", String(count), "270"],
          };
          expect(setActionBar).toHaveBeenLastCalledWith(
            sneaking
              ? {
                  rawtext: [
                    { translate: BUILD_MESSAGE.sneakingPrefix },
                    { text: " " },
                    line,
                  ],
                }
              : line,
          );
        }
        const box = boxOf(cellOf(a), cellOf(b));
        const centered = boxOutline(box);
        const set = preview(
          style === "selection" ? { shape: centered } : { paste: centered },
        );
        feedback.drawPreview(playerId, dimension, set);
        expect(spawnParticle.mock.calls).toEqual(
          centered.map((p) => [
            style === "selection"
              ? "yasu_build:outline"
              : "minecraft:blue_flame_particle",
            p,
            style === "selection" ? expect.anything() : undefined,
          ]),
        );
        spawnParticle.mockClear();
        feedback.drawPreview(playerId, asDimensionId("minecraft:nether"), set);
        expect(spawnParticle).not.toHaveBeenCalled();
        player.isValid = false;
        setActionBar.mockClear();
        feedback.showMessage(playerId, "selectionCleared");
        feedback.showMode(playerId, {
          kind: "pasteReady",
          size: { x: 9, y: 12, z: 5 },
          blockCount: count,
          degrees: 270,
        });
        feedback.showSize(playerId, { x: 9, y: 12, z: 5 });
        feedback.drawPreview(playerId, dimension, set);
        expect(setActionBar).not.toHaveBeenCalled();
        expect(spawnParticle).not.toHaveBeenCalled();
      },
    ),
  );
});

it("draws the marker particles on the corner boundary for the owner only", () => {
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
      feedback.drawPreview(
        playerId,
        dimension,
        preview({ startMarker: cornerMarkerPoints(cellOf(at)) }),
      );
      expect(engine.getEntity).toHaveBeenLastCalledWith(playerId);
      expect(spawnParticle).toHaveBeenCalledTimes(
        cornerMarkerPoints(cellOf(at)).length,
      );
      expect(
        spawnParticle.mock.calls.map(([particle, point]) => [particle, point]),
      ).toEqual(
        cornerMarkerPoints(cellOf(at)).map((point) => [
          "yasu_build:marker",
          point,
        ]),
      );
      spawnParticle.mockClear();
      feedback.drawPreview(
        playerId,
        asDimensionId("minecraft:nether"),
        preview({ startMarker: cornerMarkerPoints(cellOf(at)) }),
      );
      expect(spawnParticle).not.toHaveBeenCalled();
      player.isValid = false;
      feedback.drawPreview(
        playerId,
        dimension,
        preview({ startMarker: cornerMarkerPoints(cellOf(at)) }),
      );
      expect(spawnParticle).not.toHaveBeenCalled();
      engine.getEntity.mockReturnValue(undefined);
      feedback.drawPreview(
        playerId,
        dimension,
        preview({ startMarker: cornerMarkerPoints(cellOf(at)) }),
      );
      expect(spawnParticle).not.toHaveBeenCalled();
    }),
  );
});

it("stops a corner marker at the first rejected particle without throwing", () => {
  fc.assert(
    fc.property(
      cell,
      fc.integer({ min: 0, max: 35 }),
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
          new BedrockFeedback().drawPreview(
            playerId,
            dimension,
            preview({
              startMarker: cornerMarkerPoints(cellOf(at)),
              shape: [{ x: 0, y: 0, z: 0 }],
              endMarker: cornerMarkerPoints(cellOf(at)),
            }),
          ),
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
    expect(blocks.materialOf(dimension, cellOf({ x: 0, y: 64, z: 0 }))).toBe(
      "refused",
    );
  }
});

it("uses a distinct Molang color map for each marker layer and reuses it for the layer's points", () => {
  const spawnParticle = vi.fn();
  engine.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    dimension: { id: dimension },
    spawnParticle,
  });
  const first = { x: 1, y: 2, z: 3 };
  const second = { x: 2, y: 2, z: 3 };
  new BedrockFeedback().drawPreview(
    playerId,
    dimension,
    preview({
      startMarker: [first, second],
      endMarker: [first, second],
      sharedMarker: [first, second],
    }),
  );
  expect(spawnParticle).toHaveBeenCalledTimes(6);
  const colors = [
    { red: 1, green: 1, blue: 1 },
    { red: 1, green: 0.15, blue: 0.15 },
    { red: 1, green: 0.55, blue: 0 },
  ];
  const maps = colors.map((color, index) => {
    const firstCall = index * 2 + 1;
    const molang = spawnParticle.mock.calls[firstCall - 1]?.[2];
    expect(spawnParticle).toHaveBeenNthCalledWith(
      firstCall,
      "yasu_build:marker",
      first,
      expect.objectContaining({ colors: { "variable.color": color } }),
    );
    expect(spawnParticle).toHaveBeenNthCalledWith(
      firstCall + 1,
      "yasu_build:marker",
      second,
      molang,
    );
    expect(spawnParticle.mock.calls[firstCall]?.[2]).toBe(molang);
    return molang;
  });
  expect(new Set(maps).size).toBe(colors.length);
});

it("draws outlines with the marker particle and flames without Molang variables in the viewer dimension when no dimension is fixed", () => {
  const spawnParticle = vi.fn();
  engine.getEntity.mockReturnValue({
    typeId: "minecraft:player",
    isValid: true,
    dimension: { id: "minecraft:nether" },
    spawnParticle,
  });
  const point = { x: 1, y: 2, z: 3 };
  new BedrockFeedback().drawPreview(
    playerId,
    undefined,
    preview({
      shape: [point],
      roof: [point],
      stairs: [point],
      paste: [point],
      pasteVertical: [point],
    }),
  );
  expect(spawnParticle.mock.calls).toEqual([
    ["yasu_build:outline", point, expect.anything()],
    ["yasu_build:outline", point, expect.anything()],
    ["yasu_build:outline", point, expect.anything()],
    ["minecraft:blue_flame_particle", point, undefined],
    ["minecraft:basic_flame_particle", point, undefined],
  ]);
});

it("converts each dimension's exclusive height maximum to the highest block Y", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -128, max: 128 }),
      fc.integer({ min: 1, max: 1024 }),
      (min, span) => {
        const blocks = new BedrockBlockWorld({ isProtected: () => false });
        engine.getDimension.mockImplementation((id: string) => ({
          heightRange:
            id === "minecraft:overworld"
              ? { min: -64, max: 320 }
              : { min, max: min + span },
        }));
        expect(blocks.heightRange(asDimensionId("minecraft:nether"))).toEqual({
          minY: min,
          maxY: min + span - 1,
        });
        expect(engine.getDimension).toHaveBeenLastCalledWith(
          "minecraft:nether",
        );
        expect(blocks.heightRange(dimension)).toEqual({ minY: -64, maxY: 319 });
        expect(engine.getDimension).toHaveBeenLastCalledWith(dimension);
      },
    ),
  );
});
