import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { PAINTS } from "../../../src/domain/shared/paint";
import {
  BedrockVariantPaintWorld,
  dyeOf,
  heldDye,
  PAINT_BY_DYE,
  paintEvent,
} from "../../../src/infrastructure/shared/dyes";
import { PAINT_VARIANT } from "../../../src/test-pack/scenarios/support/paintContract";
import { playerWith } from "../../support/playerWith";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: { getEntity: game.getEntity },
}));

const target = "gear";
const typeId = "test:gear";
const adapter = new BedrockVariantPaintWorld(typeId, "white");
const PLAYER = asPlayerId("player");

function fakeGear(over: Record<string, unknown> = {}) {
  const dimension = { playSound: vi.fn() };
  return {
    id: target,
    typeId,
    isValid: true,
    location: { x: 1, y: 2, z: 3 },
    dimension,
    triggerEvent: vi.fn(),
    getComponent: vi.fn((): { value: number } | undefined => undefined),
    ...over,
  };
}

function fakePlayer(items: ({ typeId: string; amount: number } | undefined)[]) {
  const container = {
    getItem: vi.fn((slot: number) => items[slot]),
    setItem: vi.fn(),
  };
  const player = {
    id: "player",
    typeId: "minecraft:player",
    isValid: true,
    selectedSlotIndex: 1,
    getComponent: () => ({ container }),
  };
  return { player, container };
}

beforeEach(() => vi.clearAllMocks());

describe("BedrockVariantPaintWorld (ADR 0031)", () => {
  it("reads the variant as a paint, and a missing variant as variant 0", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PAINTS),
        fc.constantFrom(...PAINTS),
        (paint, defaultPaint) => {
          const gear = fakeGear();
          gear.getComponent.mockReturnValue({ value: PAINT_VARIANT[paint] });
          game.getEntity.mockReturnValue(gear);
          const world = new BedrockVariantPaintWorld(typeId, defaultPaint);
          expect(world.paintOf(target)).toBe(paint);
          expect(gear.getComponent).toHaveBeenCalledWith("minecraft:variant");
          expect(world.defaultPaintOf(target)).toBe(defaultPaint);
        },
      ),
    );
    game.getEntity.mockReturnValue(fakeGear());
    expect(adapter.paintOf(target)).toBe("khaki");
  });

  it("has no paint for a missing, invalid, or non-gear entity", () => {
    for (const entity of [
      undefined,
      fakeGear({ isValid: false }),
      fakeGear({ typeId: "yasu_ride:suv" }),
    ]) {
      game.getEntity.mockReturnValue(entity);
      expect(adapter.paintOf(target)).toBeUndefined();
      expect(adapter.defaultPaintOf(target)).toBeUndefined();
    }
  });

  it("triggers the paint event without playing a sound", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        const gear = fakeGear();
        game.getEntity.mockReturnValue(gear);
        adapter.setPaint(target, paint);
        expect(gear.triggerEvent).toHaveBeenCalledExactlyOnceWith(
          paintEvent(paint),
        );
        expect(gear.dimension.playSound).not.toHaveBeenCalled();
      }),
    );
  });

  it("plays dye.use at the gear and swallows a failing sound", () => {
    const gear = fakeGear();
    game.getEntity.mockReturnValue(gear);
    adapter.playPaintSound(target);
    expect(gear.dimension.playSound).toHaveBeenCalledExactlyOnceWith(
      "dye.use",
      gear.location,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    gear.dimension.playSound.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => adapter.playPaintSound(target)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("takes one dye of the paint from the selected slot only", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        const dye = { typeId: dyeOf(paint), amount: 3 };
        const { player, container } = fakePlayer([
          { typeId: dyeOf(paint), amount: 5 },
          dye,
        ]);
        game.getEntity.mockReturnValue(player);
        adapter.consumeDye(PLAYER, paint);
        expect(container.setItem).toHaveBeenCalledExactlyOnceWith(1, dye);
        expect(dye.amount).toBe(2);
      }),
    );
  });

  it("takes nothing when the selected slot holds another dye", () => {
    const { player, container } = fakePlayer([
      undefined,
      { typeId: dyeOf("blue"), amount: 1 },
    ]);
    game.getEntity.mockReturnValue(player);
    adapter.consumeDye(PLAYER, "red");
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it.each<[string, (world: BedrockVariantPaintWorld<string>) => void]>([
    ["playPaintSound", (world) => world.playPaintSound(target)],
    ["setPaint", (world) => world.setPaint(target, "red")],
    ["consumeDye", (world) => world.consumeDye(PLAYER, "red")],
  ])("%s skips missing and wrong-type entities", (_method, write) => {
    game.getEntity.mockReturnValue(undefined);
    write(adapter);

    const other = fakeGear({ typeId: "minecraft:cow" });
    game.getEntity.mockReturnValue(other);
    write(adapter);
    expect(other.dimension.playSound).not.toHaveBeenCalled();
    expect(other.triggerEvent).not.toHaveBeenCalled();
    expect(other.getComponent).not.toHaveBeenCalled();
  });
});

it("maps every paint to a distinct dye and back", () => {
  fc.assert(
    fc.property(fc.constantFrom(...PAINTS), (paint) => {
      expect(PAINT_BY_DYE[dyeOf(paint)]).toBe(paint);
    }),
  );
  expect(new Set(PAINTS.map(dyeOf)).size).toBe(16);
  expect(dyeOf("khaki")).toBe("minecraft:brown_dye");
});

it("reads any dye from the selected slot", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...Object.entries(PAINT_BY_DYE)),
      fc.integer({ min: 0, max: 8 }),
      ([dye, paint], slot) => {
        expect(heldDye(playerWith(dye, slot))).toBe(paint);
      },
    ),
  );
});

it("rejects a held item that is not a dye", () => {
  expect(heldDye(playerWith("minecraft:stick", 3))).toBeUndefined();
});
