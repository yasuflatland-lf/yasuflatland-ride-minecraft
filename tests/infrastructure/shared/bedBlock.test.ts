import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SleepInBed } from "../../../src/application/shared/sleepInBed";
import { registerBedBlock } from "../../../src/infrastructure/shared/bedBlock";

type Startup = (ev: {
  blockComponentRegistry: { registerCustomComponent: typeof game.register };
}) => void;

const game = vi.hoisted(() => ({
  startup: vi.fn<(handler: Startup) => void>(),
  register:
    vi.fn<
      (
        id: string,
        component: { onPlayerInteract: (ev: unknown) => void },
      ) => void
    >(),
}));
vi.mock("@minecraft/server", () => ({
  system: { beforeEvents: { startup: { subscribe: game.startup } } },
}));

function registered(
  componentId: string,
  spawnCellFor?: Parameters<typeof registerBedBlock>[2],
) {
  const execute = vi.fn();
  registerBedBlock(
    componentId,
    { execute } as unknown as SleepInBed,
    spawnCellFor,
  );
  for (const [handler] of game.startup.mock.calls)
    handler({
      blockComponentRegistry: { registerCustomComponent: game.register },
    });
  return { execute };
}

beforeEach(() => {
  game.startup.mockReset();
  game.register.mockReset();
});

describe("registerBedBlock (ADR 0092)", () => {
  it("registers exactly the given component id, once, at startup", () => {
    fc.assert(
      fc.property(fc.string(), (suffix) => {
        game.startup.mockReset();
        game.register.mockReset();
        const componentId = `yasu_ride:${suffix}`;
        registered(componentId);
        expect(game.startup).toHaveBeenCalledTimes(1);
        expect(game.register.mock.calls.map(([id]) => id)).toEqual([
          componentId,
        ]);
      }),
    );
  });

  it("registers nothing before startup", () => {
    registerBedBlock("yasu_ride:test_bed", {
      execute: vi.fn(),
    } as unknown as SleepInBed);
    expect(game.register).not.toHaveBeenCalled();
  });

  it("passes the player, dimension, and cell of an interaction to the bed once", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
        (playerId, dimensionId, cell) => {
          game.startup.mockReset();
          game.register.mockReset();
          const { execute } = registered("yasu_ride:test_bed");
          const [, component] = game.register.mock.calls[0] ?? [];
          component?.onPlayerInteract({
            player: { id: playerId },
            dimension: { id: dimensionId },
            block: { location: cell },
          });
          expect(execute).toHaveBeenCalledTimes(1);
          expect(execute).toHaveBeenCalledWith({ playerId, dimensionId, cell });
        },
      ),
    );
  });

  it("ignores an interaction without a player", () => {
    const { execute } = registered("yasu_ride:test_bed");
    const [, component] = game.register.mock.calls[0] ?? [];
    component?.onPlayerInteract({
      dimension: { id: "minecraft:overworld" },
      block: { location: { x: 0, y: 64, z: 0 } },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

it.each([true, false])(
  "uses the resolved spawn cell or falls back when absent: %s (ADR 0182)",
  (resolved) => {
    const cell = { x: 1, y: 65, z: 2 };
    const spawn = { x: 0, y: 65, z: -3 };
    const spawnCellFor = vi.fn(() => (resolved ? spawn : undefined));
    const { execute } = registered("yasu_ride:test_bed", spawnCellFor);
    const [, component] = game.register.mock.calls[0] ?? [];
    component?.onPlayerInteract({
      player: { id: "p" },
      dimension: { id: "minecraft:overworld" },
      block: { location: cell },
    });
    expect(spawnCellFor).toHaveBeenCalledExactlyOnceWith(
      "minecraft:overworld",
      cell,
    );
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "p",
      dimensionId: "minecraft:overworld",
      cell: resolved ? spawn : cell,
    });
  },
);
