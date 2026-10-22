import { Player } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HitChair } from "../../../src/application/camp/hitChair";
import type { PlaceChair } from "../../../src/application/camp/placeChair";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import {
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TEST_CHAIR_HIT_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import { NAMESPACE } from "../../../src/infrastructure/shared/identifiers";
import { defined } from "../../support/defined";

type Handler = (ev: never) => void;

const game = vi.hoisted(() => ({
  hit: vi.fn<(handler: Handler) => void>(),
  interact: vi.fn<(handler: Handler) => void>(),
  script: vi.fn<(handler: Handler, options?: unknown) => void>(),
  run: vi.fn<(callback: () => void) => void>(),
  currentTick: 10,
}));
vi.mock("@minecraft/server", () => ({
  Direction: {
    Up: "Up",
    Down: "Down",
    North: "North",
    South: "South",
    East: "East",
    West: "West",
  },
  ScriptEventSource: { Server: "Server", Entity: "Entity" },
  Player: class {},
  system: {
    get currentTick() {
      return game.currentTick;
    },
    run: game.run,
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
  world: {
    beforeEvents: { playerInteractWithBlock: { subscribe: game.interact } },
    afterEvents: { entityHitEntity: { subscribe: game.hit } },
  },
}));

function subscribed(signal: { mock: { calls: unknown[][] } }) {
  return defined(signal.mock.calls[0]?.[0], "handler") as (ev: unknown) => void;
}

const playerWithId = (id: string) =>
  Object.assign(Object.create(Player.prototype) as object, { id });

function fakeHitChair() {
  const execute = vi.fn(() => false);
  return { execute, hitChair: { execute } as unknown as HitChair };
}

beforeEach(() => {
  vi.clearAllMocks();
  game.currentTick = 10;
});

describe("registerChairHits (ADR 0122)", () => {
  it("passes a player's hit on a low chair to the use case", () => {
    const { execute, hitChair } = fakeHitChair();
    registerChairHits(hitChair);
    subscribed(game.hit)({
      damagingEntity: playerWithId("p"),
      hitEntity: { id: "chair", typeId: LOW_CHAIR_TYPE },
    });
    expect(execute).toHaveBeenCalledWith({
      chairId: "chair",
      tick: 10,
      playerId: "p",
    });
  });

  it("ignores a hit by something other than a player, or on another entity", () => {
    const { execute, hitChair } = fakeHitChair();
    registerChairHits(hitChair);
    const handler = subscribed(game.hit);
    handler({
      damagingEntity: { id: "zombie" },
      hitEntity: { id: "chair", typeId: LOW_CHAIR_TYPE },
    });
    handler({
      damagingEntity: playerWithId("p"),
      hitEntity: { id: "car", typeId: "yasu_ride:suv" },
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("registerChairPlacement (ADR 0122)", () => {
  const FACES = {
    Up: "up",
    Down: "down",
    North: "north",
    South: "south",
    East: "east",
    West: "west",
  } as const;

  function setup(cell: { x: number; y: number; z: number } | undefined) {
    const cellFor = vi.fn(() => cell);
    const execute = vi.fn(() => true);
    registerChairPlacement({ cellFor, execute } as unknown as PlaceChair);
    const handler = subscribed(game.interact);
    const press = (over: Record<string, unknown> = {}) => {
      const ev = {
        isFirstEvent: true,
        itemStack: { typeId: LOW_CHAIR_ITEM },
        block: {
          dimension: { id: "overworld" },
          location: { x: 1, y: 2, z: 3 },
        },
        blockFace: "Up",
        player: {
          id: "p",
          selectedSlotIndex: 4,
          getRotation: () => ({ x: 0, y: 45 }),
        },
        cancel: false,
        ...over,
      };
      handler(ev);
      return ev;
    };
    return { cellFor, execute, press };
  }

  it("asks for the cell with the clicked face, whichever face it is", () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(FACES)), (face) => {
        vi.clearAllMocks();
        const { cellFor, press } = setup(undefined);
        press({ blockFace: face });
        expect(cellFor).toHaveBeenCalledWith(
          "overworld",
          { x: 1, y: 2, z: 3 },
          FACES[face as keyof typeof FACES],
        );
      }),
    );
  });

  it("cancels the press and places the chair on the next tick", () => {
    const cell = { x: 1, y: 2, z: 3 };
    const { execute, press } = setup(cell);
    const ev = press();
    expect(ev.cancel).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    defined(game.run.mock.calls[0]?.[0], "next tick")();
    expect(execute).toHaveBeenCalledWith({
      playerId: "p",
      dimensionId: "overworld",
      blockLocation: cell,
      yaw: 45,
      slot: 4,
    });
  });

  it("places once per player per tick, however often the press repeats", () => {
    const { press } = setup({ x: 1, y: 2, z: 3 });
    press();
    press();
    expect(game.run).toHaveBeenCalledTimes(1);
    game.currentTick = 11;
    press();
    expect(game.run).toHaveBeenCalledTimes(2);
  });

  it("leaves the press to the block when the chair cannot go there", () => {
    const { press } = setup(undefined);
    const ev = press();
    expect(ev.cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
  });

  it("ignores a repeated press, another item, and an empty hand", () => {
    const { cellFor, press } = setup({ x: 1, y: 2, z: 3 });
    press({ isFirstEvent: false });
    press({ itemStack: { typeId: "minecraft:dirt" } });
    press({ itemStack: undefined });
    expect(cellFor).not.toHaveBeenCalled();
    expect(game.run).not.toHaveBeenCalled();
  });
});

describe("registerTestChairHit (ADR 0010, 0122)", () => {
  it("listens only in the add-on's namespace", () => {
    registerTestChairHit(fakeHitChair().hitChair);
    expect(game.script.mock.calls[0]?.[1]).toEqual({ namespaces: [NAMESPACE] });
  });

  it("hits the chair whose id the server sent, without a player", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => s.trim() !== ""),
        fc.constantFrom("", " ", "\n"),
        (id, pad) => {
          vi.clearAllMocks();
          const { execute, hitChair } = fakeHitChair();
          registerTestChairHit(hitChair);
          subscribed(game.script)({
            id: TEST_CHAIR_HIT_EVENT,
            sourceType: "Server",
            message: `${pad}${id}${pad}`,
          });
          expect(execute).toHaveBeenCalledWith({
            chairId: id.trim(),
            tick: 10,
          });
        },
      ),
    );
  });

  it("ignores other events, other sources, and a message with no id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { execute, hitChair } = fakeHitChair();
    registerTestChairHit(hitChair);
    const handler = subscribed(game.script);
    handler({ id: "yasu_ride:other", sourceType: "Server", message: "chair" });
    handler({
      id: TEST_CHAIR_HIT_EVENT,
      sourceType: "Entity",
      message: "chair",
    });
    handler({ id: TEST_CHAIR_HIT_EVENT, sourceType: "Server", message: "  " });
    expect(execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
