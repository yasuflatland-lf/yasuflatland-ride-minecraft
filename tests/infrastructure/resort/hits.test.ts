import { expect, it, vi } from "vitest";
import { PaintParasol } from "../../../src/application/resort/paintParasol";
import { TakeBackParasol } from "../../../src/application/resort/takeBackParasol";
import { Repaint } from "../../../src/application/shared/repaint";
import { registerParasolHits } from "../../../src/infrastructure/resort/bedrock/handlers/hits";
import { BEACH_PARASOL } from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => {
  class Player {
    id = "player";
  }
  return {
    Player,
    tick: 1,
    dye: true,
    hit: undefined as ((event: unknown) => void) | undefined,
  };
});
vi.mock("@minecraft/server", () => ({
  Player: game.Player,
  system: {
    get currentTick() {
      return game.tick;
    },
  },
  world: {
    afterEvents: {
      entityHitEntity: {
        subscribe: (fn: (event: unknown) => void) => {
          game.hit = fn;
        },
      },
    },
  },
}));
vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  heldDye: () => (game.dye ? "red" : undefined),
}));

it("does not count dye hits toward recovery and gates a second swing in the tick", () => {
  const setPaint = vi.fn();
  const remove = vi.fn();
  const takeBack = new TakeBackParasol({
    clearCeiling: vi.fn(),
    dropItem: vi.fn(),
    remove,
    showTaken: vi.fn(),
    showRemaining: vi.fn(),
  } as never);
  const paint = new PaintParasol(
    new Repaint({
      paintOf: () => "white",
      defaultPaintOf: () => "white",
      setPaint,
      consumeDye: vi.fn(),
      playPaintSound: vi.fn(),
      isCreative: () => false,
    }),
  );
  registerParasolHits(takeBack, paint);
  const hit = () =>
    game.hit?.({
      damagingEntity: new game.Player(),
      hitEntity: { id: "parasol", typeId: BEACH_PARASOL },
    });
  game.tick = 1;
  game.dye = true;
  hit();
  game.dye = false;
  hit();
  expect(setPaint).toHaveBeenCalledTimes(1);
  for (game.tick = 2; game.tick <= 3; game.tick++) hit();
  expect(remove).not.toHaveBeenCalled();
  hit();
  expect(remove).toHaveBeenCalledTimes(1);
});
