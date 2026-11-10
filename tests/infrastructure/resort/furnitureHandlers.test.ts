import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceFurniture } from "../../../src/application/resort/placeFurniture";
import { TakeBackFurniture } from "../../../src/application/resort/takeBackFurniture";
import type { FurnitureKind } from "../../../src/domain/resort/furniture";
import { asFurnitureId } from "../../../src/domain/resort/ids";
import { registerFurnitureHits } from "../../../src/infrastructure/resort/bedrock/handlers/furnitureHits";
import { registerFurniturePlacement } from "../../../src/infrastructure/resort/bedrock/handlers/furniturePlacement";
import {
  DINING_TABLE_TOP,
  FURNITURE_IDS,
} from "../../../src/infrastructure/resort/identifiers";
import { fakeFurnitureWorld } from "../../application/resort/fakeFurnitureWorld";

vi.mock("../../../src/infrastructure/shared/dyes", () => ({
  heldDye: () => (game.dye ? "red" : undefined),
}));
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
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
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
    afterEvents: game.events,
  },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  game.handlers.clear();
  game.tick = 10;
  game.dye = false;
});
describe.each(Object.keys(FURNITURE_IDS) as FurnitureKind[])("%s", (kind) => {
  function setup() {
    const world = fakeFurnitureWorld(kind);
    registerFurniturePlacement(new PlaceFurniture(world));
    registerFurnitureHits(new TakeBackFurniture(world), {
      ownerAt: () => undefined,
    });
  }
  it("defers placement, captures the command, cancels duplicates and ignores unrelated presses", () => {
    const execute = vi
      .spyOn(PlaceFurniture.prototype, "execute")
      .mockReturnValue(true);
    setup();
    const press = game.handlers.get("playerInteractWithBlock");
    const ev = {
      isFirstEvent: true,
      itemStack: { typeId: FURNITURE_IDS[kind].item },
      player: new game.Player(),
      block: { dimension: { id: "overworld" }, location: { x: 1, y: 2, z: 3 } },
      blockFace: "Up",
      cancel: false,
    };
    press?.({ ...ev, isFirstEvent: false });
    press?.({ ...ev, itemStack: { typeId: "other" } });
    expect(game.run).not.toHaveBeenCalled();
    press?.(ev);
    press?.(ev);
    expect(ev.cancel).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(game.run).toHaveBeenCalledTimes(1);
    ev.block.location.x = 99;
    game.run.mock.calls[0]?.[0]();
    expect(execute).toHaveBeenCalledWith({
      player: "p",
      dimension: "overworld",
      block: { x: 1, y: 2, z: 3 },
      face: "up",
      yaw: 90,
      slot: 2,
      kind,
    });
    game.tick++;
    press?.(ev);
    expect(game.run).toHaveBeenCalledTimes(2);
  });
  it("counts hits only on chairs once per player per tick", () => {
    const execute = vi
      .spyOn(TakeBackFurniture.prototype, "hit")
      .mockImplementation(() => {});
    setup();
    const hit = game.handlers.get("entityHitEntity");
    const ev = {
      damagingEntity: new game.Player(),
      hitEntity: { id: "chair", typeId: FURNITURE_IDS[kind].entity },
    };
    hit?.({ ...ev, hitEntity: { typeId: "other" } });
    hit?.({ ...ev, damagingEntity: { id: "mob" } });
    hit?.(ev);
    hit?.(ev);
    expect(execute).not.toHaveBeenCalled();
    expect(game.run).toHaveBeenCalledTimes(1);
    game.run.mock.calls[0]?.[0]();
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      id: "chair",
      player: "p",
      now: 10,
    });
    game.tick++;
    hit?.(ev);
    expect(game.run).toHaveBeenCalledTimes(2);
    game.run.mock.calls[1]?.[0]();
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("ignores dye hits without scheduling recovery", () => {
    setup();
    game.dye = true;
    game.handlers.get("entityHitEntity")?.({
      damagingEntity: new game.Player(),
      hitEntity: { id: "chair", typeId: FURNITURE_IDS[kind].entity },
    });
    expect(game.run).not.toHaveBeenCalled();
  });
});

it("forwards owned block hits and Creative breaks with shared deduplication and dye exclusion", () => {
  const world = fakeFurnitureWorld("dining_table");
  const take = new TakeBackFurniture(world);
  const hit = vi.spyOn(take, "hit").mockImplementation(() => {});
  const ownerAt = vi.fn(
    () =>
      asFurnitureId("table") as ReturnType<
        import("../../../src/application/resort/ports/furnitureTopBlocks").FurnitureTopBlocksWorld["ownerAt"]
      >,
  );
  registerFurnitureHits(take, { ownerAt });
  const player = new game.Player();
  const block = {
    typeId: DINING_TABLE_TOP,
    dimension: { id: "overworld" },
    location: { x: 1, y: 2, z: 3 },
  };
  const swing = () =>
    game.handlers.get("entityHitBlock")?.({
      damagingEntity: player,
      hitBlock: block,
    });
  const breakEvent = {
    player,
    block,
    dimension: block.dimension,
    cancel: false,
  };
  const breaking = () => game.handlers.get("playerBreakBlock")?.(breakEvent);
  game.dye = true;
  swing();
  breaking();
  expect(game.run).not.toHaveBeenCalled();
  game.dye = false;
  ownerAt.mockReturnValue(undefined);
  swing();
  breaking();
  expect(game.run).not.toHaveBeenCalled();
  ownerAt.mockReturnValue(asFurnitureId("table"));
  swing();
  breaking();
  game.handlers.get("entityHitEntity")?.({
    damagingEntity: player,
    hitEntity: { typeId: FURNITURE_IDS.dining_table.entity, id: "table" },
  });
  expect(game.run).toHaveBeenCalledTimes(1);
  expect(hit).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  expect(hit).toHaveBeenCalledWith({ player: "p", id: "table", now: 10 });
  expect(breakEvent.cancel).toBe(false);
  game.tick++;
  breaking();
  expect(game.run).toHaveBeenCalledTimes(2);
  game.tick++;
  vi.spyOn(player, "getGameMode").mockReturnValue("Survival");
  breaking();
  expect(game.run).toHaveBeenCalledTimes(2);
  block.typeId = "minecraft:stone";
  swing();
  expect(game.run).toHaveBeenCalledTimes(2);
});
