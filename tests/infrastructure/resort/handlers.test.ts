import { beforeEach, expect, it, vi } from "vitest";
import { PlaceParasol } from "../../../src/application/resort/placeParasol";
import { SyncParasolCeilings } from "../../../src/application/resort/syncParasolCeilings";
import { TakeBackParasol } from "../../../src/application/resort/takeBackParasol";
import { asParasolId } from "../../../src/domain/resort/ids";
import { PARASOL_SPEC } from "../../../src/domain/resort/spec";
import { BedrockParasolWorld } from "../../../src/infrastructure/resort/bedrock/bedrockParasolWorld";
import {
  BEACH_PARASOL,
  BEACH_PARASOL_ITEM,
  PARASOL_CEILING_BLOCK,
} from "../../../src/infrastructure/resort/identifiers";
import { installResort } from "../../../src/infrastructure/resort/install";

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
  };
});
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
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
});
function setup() {
  const deps = {
    isVehicleSpace: vi.fn(() => true),
    isCampSpace: vi.fn(() => false),
  };
  installResort(deps);
  return deps;
}
it("defers placement, captures the command, cancels duplicates and ignores unrelated presses", () => {
  const execute = vi
    .spyOn(PlaceParasol.prototype, "execute")
    .mockReturnValue(true);
  setup();
  const press = game.handlers.get("playerInteractWithBlock");
  const ev = {
    isFirstEvent: true,
    itemStack: { typeId: BEACH_PARASOL_ITEM },
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
  });
  game.tick++;
  press?.(ev);
  expect(game.run).toHaveBeenCalledTimes(2);
});
it("counts hits only on parasols once per player per tick", () => {
  const execute = vi
    .spyOn(TakeBackParasol.prototype, "execute")
    .mockImplementation(() => {});
  setup();
  const hit = game.handlers.get("entityHitEntity");
  const ev = {
    damagingEntity: new game.Player(),
    hitEntity: { id: "parasol", typeId: BEACH_PARASOL },
  };
  hit?.({ ...ev, hitEntity: { typeId: "other" } });
  hit?.({ ...ev, damagingEntity: { id: "mob" } });
  hit?.(ev);
  hit?.(ev);
  expect(execute).toHaveBeenCalledTimes(1);
  game.tick++;
  hit?.(ev);
  expect(execute).toHaveBeenCalledTimes(2);
});
it("wires the scan interval, shared block guard and both space checks", () => {
  const sync = vi
    .spyOn(SyncParasolCeilings.prototype, "execute")
    .mockImplementation(() => {});
  const owner = vi
    .spyOn(BedrockParasolWorld.prototype, "ceilingOwner")
    .mockReturnValue("p");
  const deps = setup();
  const loaded = { id: "p" };
  game.getDimension.mockReturnValue({ getEntities: () => [loaded] });
  expect(game.runInterval).toHaveBeenCalledWith(
    expect.any(Function),
    PARASOL_SPEC.ceilingSyncTicks,
  );
  game.runInterval.mock.calls[0]?.[0]();
  expect(sync).toHaveBeenCalledWith(["p", "p", "p"]);
  const ev = {
    dimension: { id: "overworld" },
    block: { location: { x: 0, y: 5, z: 0 }, typeId: PARASOL_CEILING_BLOCK },
    cancel: false,
  };
  game.handlers.get("playerBreakBlock")?.(ev);
  expect(ev.cancel).toBe(true);
  expect(owner).toHaveBeenCalled();
  const adapter = owner.mock.instances[0] as BedrockParasolWorld | undefined;
  expect(adapter?.isVehicleSpace("overworld" as never, ev.block.location)).toBe(
    true,
  );
  expect(adapter?.isCampSpace("overworld" as never, ev.block.location)).toBe(
    false,
  );
  expect(deps.isCampSpace).toHaveBeenCalled();
});
it("clears confirmed removals but preserves unloaded chunks and still-loaded entities", () => {
  const remember = vi
    .spyOn(BedrockParasolWorld.prototype, "remember")
    .mockReturnValue({ dimension: {} as never, cells: [] });
  const clear = vi
    .spyOn(BedrockParasolWorld.prototype, "clearCeiling")
    .mockReturnValue(true);
  setup();
  const dimension = { getBlock: vi.fn() };
  const entity = {
    id: "p",
    typeId: BEACH_PARASOL,
    dimension,
    location: { x: 1, y: 2, z: 3 },
  };
  const remove = game.handlers.get("entityRemove");
  for (const state of ["unloaded", "throw", "present", "gone"]) {
    game.getEntity.mockReturnValue(
      state === "present" ? { ...entity, isValid: true } : undefined,
    );
    dimension.getBlock.mockImplementation(() => {
      if (state === "throw") throw Error("unloaded");
      return state === "unloaded" ? undefined : {};
    });
    remove?.({ removedEntity: entity });
    expect(remember).toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    game.run.mock.lastCall?.[0]();
    if (state !== "gone") expect(clear).not.toHaveBeenCalled();
  }
  expect(clear).toHaveBeenCalledExactlyOnceWith(asParasolId("p"));
});
