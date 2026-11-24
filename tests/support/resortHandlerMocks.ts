import { vi } from "vitest";

const game = vi.hoisted(() => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const events = new Proxy(
    {},
    {
      get: (_target, name: string) => ({
        subscribe: (fn: (ev: unknown) => void) => handlers.set(name, fn),
      }),
    },
  );
  class Player {
    id = "p";
    isValid = true;
    selectedSlotIndex = 2;
    getGameMode() {
      return "Creative";
    }
    getRotation() {
      return { y: 90 };
    }
  }
  return {
    handlers,
    Player,
    events,
    run: vi.fn(),
    runInterval: vi.fn(),
    getDimension: vi.fn(),
    getEntity: vi.fn(),
    tick: 0,
    dye: false,
  };
});
export const bedrockResortHandlers = () => ({
  Direction: { Up: "Up", North: "North" },
  GameMode: { Creative: "Creative" },
  Player: game.Player,
  world: {
    beforeEvents: game.events,
    afterEvents: game.events,
    getDimension: game.getDimension,
    getEntity: game.getEntity,
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: game.runInterval,
    beforeEvents: game.events,
    afterEvents: game.events,
  },
});

export function resortHandlerGame() {
  return game;
}
