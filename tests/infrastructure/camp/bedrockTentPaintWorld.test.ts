import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asTentId } from "../../../src/domain/camp/tent";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { PAINTS } from "../../../src/domain/shared/paint";
import { BedrockTentPaintWorld } from "../../../src/infrastructure/camp/bedrock/bedrockTentPaintWorld";
import { TENT_TYPE } from "../../../src/infrastructure/camp/identifiers";
import {
  dyeOf,
  PAINT_VARIANT,
  paintEvent,
} from "../../../src/infrastructure/shared/dyes";

const game = vi.hoisted(() => ({
  getEntity: vi.fn(),
  Player: class {},
}));
vi.mock("@minecraft/server", () => ({
  world: { getEntity: game.getEntity },
  Player: game.Player,
  GameMode: { Creative: "Creative", Survival: "Survival" },
}));

const TENT = asTentId("tent");
const PLAYER = asPlayerId("player");

function fakeTent(over: Record<string, unknown> = {}) {
  const dimension = { playSound: vi.fn() };
  return {
    id: "tent",
    typeId: TENT_TYPE,
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
  const player = Object.assign(Object.create(game.Player.prototype) as object, {
    id: "player",
    isValid: true,
    selectedSlotIndex: 1,
    getGameMode: vi.fn(() => "Survival"),
    getComponent: () => ({ container }),
  });
  return { player, container };
}

beforeEach(() => vi.clearAllMocks());

describe("BedrockTentPaintWorld (ADR 0031)", () => {
  it("reads the variant as a paint, and a missing variant as variant 0", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        const tent = fakeTent({
          getComponent: () => ({ value: PAINT_VARIANT[paint] }),
        });
        game.getEntity.mockReturnValue(tent);
        expect(new BedrockTentPaintWorld().paintOf(TENT)).toBe(paint);
      }),
    );
    game.getEntity.mockReturnValue(fakeTent());
    expect(new BedrockTentPaintWorld().paintOf(TENT)).toBe("khaki");
  });

  it("has no paint for a missing, invalid, or non-tent entity", () => {
    const world = new BedrockTentPaintWorld();
    for (const entity of [
      undefined,
      fakeTent({ isValid: false }),
      fakeTent({ typeId: "yasu_ride:suv" }),
    ]) {
      game.getEntity.mockReturnValue(entity);
      expect(world.paintOf(TENT)).toBeUndefined();
    }
  });

  it("triggers the paint event and plays dye.use at the tent", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAINTS), (paint) => {
        const tent = fakeTent();
        game.getEntity.mockReturnValue(tent);
        new BedrockTentPaintWorld().paint(TENT, paint);
        expect(tent.triggerEvent).toHaveBeenCalledExactlyOnceWith(
          paintEvent(paint),
        );
        expect(tent.dimension.playSound).toHaveBeenCalledWith(
          "dye.use",
          tent.location,
        );
      }),
    );
  });

  it("does nothing when painting a missing tent", () => {
    game.getEntity.mockReturnValue(undefined);
    expect(() => new BedrockTentPaintWorld().paint(TENT, "red")).not.toThrow();
    const other = fakeTent({ typeId: "minecraft:cow" });
    game.getEntity.mockReturnValue(other);
    new BedrockTentPaintWorld().paint(TENT, "red");
    expect(other.triggerEvent).not.toHaveBeenCalled();
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
        new BedrockTentPaintWorld().consumeDye(PLAYER, paint);
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
    new BedrockTentPaintWorld().consumeDye(PLAYER, "red");
    expect(container.setItem).not.toHaveBeenCalled();
  });

  it("is Creative only for a present player in Creative", () => {
    const world = new BedrockTentPaintWorld();
    game.getEntity.mockReturnValue(undefined);
    expect(world.isCreative(PLAYER)).toBe(false);
    game.getEntity.mockReturnValue(fakeTent());
    expect(world.isCreative(PLAYER)).toBe(false);
    const { player } = fakePlayer([]);
    (player as { getGameMode: () => string }).getGameMode = () => "Creative";
    game.getEntity.mockReturnValue(player);
    expect(world.isCreative(PLAYER)).toBe(true);
  });
});
