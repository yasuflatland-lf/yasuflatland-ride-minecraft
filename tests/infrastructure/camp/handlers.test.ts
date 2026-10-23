import { Player } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HitChair } from "../../../src/application/camp/hitChair";
import type { PitchTent } from "../../../src/application/camp/pitchTent";
import type { PlaceChair } from "../../../src/application/camp/placeChair";
import type { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { type TentPose, tentCells } from "../../../src/domain/camp/tent";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/tentHits";
import { registerTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "../../../src/infrastructure/camp/bedrock/handlers/tentLoop";
import { registerTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import { registerTestTent } from "../../../src/infrastructure/camp/bedrock/handlers/testTent";
import {
  LOW_CHAIR_ITEM,
  LOW_CHAIR_TYPE,
  TENT_ITEM,
  TENT_TYPE,
  TEST_CHAIR_HIT_EVENT,
  TEST_TENT_HIT_EVENT,
  TEST_TENT_PITCH_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import type { DynamicPropertyTentRegistry } from "../../../src/infrastructure/camp/persistence/tentRegistry";
import { NAMESPACE } from "../../../src/infrastructure/shared/identifiers";
import type { CellLayer } from "../../../src/infrastructure/shared/laidCells";
import { defined } from "../../support/defined";

type Handler = (ev: never) => void;

const game = vi.hoisted(() => ({
  hit: vi.fn<(handler: Handler) => void>(),
  interact: vi.fn<(handler: Handler) => void>(),
  script: vi.fn<(handler: Handler, options?: unknown) => void>(),
  run: vi.fn<(callback: () => void) => void>(),
  runInterval: vi.fn<(callback: () => void, ticks?: number) => void>(),
  hitBlock: vi.fn<(handler: Handler) => void>(),
  breakBlock: vi.fn<(handler: Handler) => void>(),
  remove: vi.fn<(handler: Handler) => void>(),
  load: vi.fn<(handler: Handler) => void>(),
  spawn: vi.fn<(handler: Handler) => void>(),
  getEntity: vi.fn(),
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
  GameMode: { Creative: "Creative", Survival: "Survival" },
  EntityInitializationCause: { Loaded: "Loaded", Spawned: "Spawned" },
  BlockPermutation: { resolve: vi.fn() },
  Player: class {},
  system: {
    get currentTick() {
      return game.currentTick;
    },
    run: game.run,
    runInterval: game.runInterval,
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
  world: {
    getEntity: game.getEntity,
    beforeEvents: {
      playerInteractWithBlock: { subscribe: game.interact },
      playerBreakBlock: { subscribe: game.breakBlock },
      entityRemove: { subscribe: game.remove },
    },
    afterEvents: {
      entityHitEntity: { subscribe: game.hit },
      entityHitBlock: { subscribe: game.hitBlock },
      entityLoad: { subscribe: game.load },
      entitySpawn: { subscribe: game.spawn },
    },
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

describe("registerTentPlacement (ADR 0131)", () => {
  function setup(accepts = true) {
    const accept = vi.fn(() => accepts);
    const execute = vi.fn(() => true);
    registerTentPlacement({ accepts: accept, execute } as unknown as PitchTent);
    const handler = subscribed(game.interact);
    const press = (over: Record<string, unknown> = {}) => {
      const ev = {
        isFirstEvent: true,
        itemStack: { typeId: TENT_ITEM },
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
    return { accept, execute, press };
  }

  it("cancels the press and pitches on the next tick, once per player per tick", () => {
    const { accept, execute, press } = setup();
    expect(press().cancel).toBe(true);
    press();
    expect(accept).toHaveBeenCalledWith("overworld", { x: 1, y: 2, z: 3 });
    expect(game.run).toHaveBeenCalledTimes(1);
    defined(game.run.mock.calls[0]?.[0], "next tick")();
    expect(execute).toHaveBeenCalledWith({
      playerId: "p",
      dimensionId: "overworld",
      clicked: { x: 1, y: 2, z: 3 },
      yaw: 45,
      slot: 4,
    });
    game.currentTick = 11;
    press();
    expect(game.run).toHaveBeenCalledTimes(2);
  });

  it("acts only for the tent item, the first event, and the top face", () => {
    const { accept, press } = setup();
    for (const over of [
      { isFirstEvent: false },
      { itemStack: { typeId: LOW_CHAIR_ITEM } },
      { itemStack: undefined },
      { blockFace: "North" },
    ])
      expect(press(over).cancel).toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(game.run).not.toHaveBeenCalled();
  });

  it("leaves a press on our blocks to the block", () => {
    const { press } = setup(false);
    expect(press().cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
  });
});

describe("registerTentHits (ADR 0130, 0131)", () => {
  function setup() {
    const execute = vi.fn(() => false);
    const owner = vi.fn((_d: string, _c: unknown, typeId: string) =>
      typeId === "yasu_ride:tent_wall" ? "tent" : undefined,
    );
    registerTentHits({ execute } as unknown as TakeDownTent, owner as never);
    return { execute, owner };
  }
  const block = (typeId: string) => ({
    typeId,
    location: { x: 1, y: 2, z: 3 },
    dimension: { id: "overworld" },
  });

  it("counts a player's hit on an owned tent block, and ignores other blocks and hitters", () => {
    const { execute, owner } = setup();
    const handler = subscribed(game.hitBlock);
    handler({
      damagingEntity: playerWithId("p"),
      hitBlock: block("minecraft:stone"),
    });
    handler({
      damagingEntity: { id: "zombie" },
      hitBlock: block("yasu_ride:tent_wall"),
    });
    expect(execute).not.toHaveBeenCalled();
    handler({
      damagingEntity: playerWithId("p"),
      hitBlock: block("yasu_ride:tent_wall"),
    });
    expect(owner).toHaveBeenLastCalledWith(
      "overworld",
      { x: 1, y: 2, z: 3 },
      "yasu_ride:tent_wall",
    );
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      tentId: "tent",
      tick: 10,
      playerId: "p",
    });
  });

  it("counts a Creative break and a block hit in the same tick once", () => {
    const { execute } = setup();
    const player = Object.assign(playerWithId("p"), {
      getGameMode: () => "Creative",
    });
    subscribed(game.breakBlock)({
      player,
      block: block("yasu_ride:tent_wall"),
      dimension: { id: "overworld" },
    });
    subscribed(game.hitBlock)({
      damagingEntity: player,
      hitBlock: block("yasu_ride:tent_wall"),
    });
    defined(game.run.mock.calls[0]?.[0], "deferred break")();
    expect(execute).toHaveBeenCalledTimes(1);
    game.currentTick = 11;
    subscribed(game.hitBlock)({
      damagingEntity: player,
      hitBlock: block("yasu_ride:tent_wall"),
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("ignores a Survival break", () => {
    setup();
    subscribed(game.breakBlock)({
      player: Object.assign(playerWithId("p"), {
        getGameMode: () => "Survival",
      }),
      block: block("yasu_ride:tent_wall"),
      dimension: { id: "overworld" },
    });
    expect(game.run).not.toHaveBeenCalled();
  });

  it("counts a player's hit on the tent entity", () => {
    const { execute } = setup();
    const handler = subscribed(game.hit);
    handler({
      damagingEntity: playerWithId("p"),
      hitEntity: { id: "chair", typeId: LOW_CHAIR_TYPE },
    });
    handler({
      damagingEntity: playerWithId("p"),
      hitEntity: { id: "t", typeId: TENT_TYPE },
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      tentId: "t",
      tick: 10,
      playerId: "p",
    });
  });
});

const POSE: TentPose = { x: 110, y: -60, z: 46, yaw: 180 };
const fakeRegistry = (ids: string[]) =>
  ({
    all: () => ids.map((id) => ({ id, dimensionId: "overworld", pose: POSE })),
    remove: vi.fn(),
  }) as unknown as DynamicPropertyTentRegistry & {
    remove: ReturnType<typeof vi.fn>;
  };

describe("registerTentLoop (ADR 0131)", () => {
  it("lays registered, loaded tents with the entity as the holder and clears by the registry", () => {
    const blocks = { lay: vi.fn(), clearGone: vi.fn() };
    registerTentLoop(
      fakeRegistry(["a", "b", "c"]),
      blocks as unknown as CellLayer<never, never>,
    );
    expect(game.runInterval.mock.calls[0]?.[1]).toBe(1);
    const a = { isValid: true, typeId: TENT_TYPE };
    const c = { isValid: true, typeId: "minecraft:cow" };
    game.getEntity.mockImplementation((id: string) =>
      id === "a" ? a : id === "c" ? c : undefined,
    );
    defined(game.runInterval.mock.calls[0]?.[0], "loop")();
    expect(blocks.lay).toHaveBeenCalledExactlyOnceWith("a", a, tentCells(POSE));
    expect(blocks.clearGone).toHaveBeenCalledWith(new Set(["a", "b", "c"]));
  });
});

describe("registerTentLifecycle (ADR 0125, 0131)", () => {
  const removal = (loaded: boolean | "throws") => ({
    removedEntity: {
      id: "a",
      typeId: TENT_TYPE,
      location: { x: 1, y: 2, z: 3 },
      dimension: {
        getBlock: () => {
          if (loaded === "throws") throw new Error("unloaded");
          return loaded ? {} : undefined;
        },
      },
    },
  });

  it("forgets a tent removed in a loaded chunk, and keeps one that unloads", () => {
    for (const loaded of [true, false, "throws"] as const) {
      vi.clearAllMocks();
      const registry = fakeRegistry(["a"]);
      registerTentLifecycle(registry);
      subscribed(game.remove)(removal(loaded));
      defined(game.run.mock.calls[0]?.[0], "next tick")();
      expect(registry.remove).toHaveBeenCalledTimes(loaded === true ? 1 : 0);
    }
  });

  it("ignores the removal of other entities", () => {
    registerTentLifecycle(fakeRegistry(["a"]));
    subscribed(game.remove)({
      removedEntity: { id: "c", typeId: "minecraft:cow" },
    });
    expect(game.run).not.toHaveBeenCalled();
  });

  it("removes a loaded tent entity the registry does not know", () => {
    registerTentLifecycle(fakeRegistry(["a"]));
    const entity = (id: string, typeId = TENT_TYPE) => ({
      id,
      typeId,
      isValid: true,
      remove: vi.fn(),
    });
    const known = entity("a");
    const orphan = entity("b");
    const cow = entity("c", "minecraft:cow");
    for (const e of [known, orphan, cow]) subscribed(game.load)({ entity: e });
    expect([known, orphan, cow].map((e) => e.remove.mock.calls.length)).toEqual(
      [0, 1, 0],
    );
    const spawned = entity("d");
    const loaded = entity("e");
    subscribed(game.spawn)({ entity: spawned, cause: "Spawned" });
    subscribed(game.spawn)({ entity: loaded, cause: "Loaded" });
    expect(spawned.remove).not.toHaveBeenCalled();
    expect(loaded.remove).toHaveBeenCalledTimes(1);
  });
});

describe("registerTestTent (ADR 0010, 0131)", () => {
  function setup() {
    const pitch = vi.fn(() => true);
    const take = vi.fn(() => false);
    registerTestTent(
      { execute: pitch } as unknown as PitchTent,
      { execute: take } as unknown as TakeDownTent,
    );
    return { pitch, take, handler: subscribed(game.script) };
  }

  it("listens only in the add-on's namespace", () => {
    setup();
    expect(game.script.mock.calls[0]?.[1]).toEqual({ namespaces: [NAMESPACE] });
  });

  it("pitches in the overworld and hits by entity id, from the server only", () => {
    const { pitch, take, handler } = setup();
    handler({
      id: TEST_TENT_PITCH_EVENT,
      sourceType: "Entity",
      message: "110 -61 46 0",
    });
    handler({ id: TEST_TENT_HIT_EVENT, sourceType: "Entity", message: "t" });
    expect(pitch).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    handler({
      id: TEST_TENT_PITCH_EVENT,
      sourceType: "Server",
      message: " 110 -61 46 0 ",
    });
    expect(pitch).toHaveBeenCalledWith({
      dimensionId: "minecraft:overworld",
      clicked: { x: 110, y: -61, z: 46 },
      yaw: 0,
      slot: 0,
    });
    handler({ id: TEST_TENT_HIT_EVENT, sourceType: "Server", message: "t" });
    expect(take).toHaveBeenCalledWith({ tentId: "t", tick: 10 });
  });

  it("warns about and ignores a malformed message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { pitch, take, handler } = setup();
    for (const message of ["", "1 2 3", "1 2 3 4 5", "1 x 3 0", "1.5 2 3 0"])
      handler({ id: TEST_TENT_PITCH_EVENT, sourceType: "Server", message });
    handler({ id: TEST_TENT_HIT_EVENT, sourceType: "Server", message: " " });
    expect(pitch).not.toHaveBeenCalled();
    expect(take).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(6);
    warn.mockRestore();
  });
});
