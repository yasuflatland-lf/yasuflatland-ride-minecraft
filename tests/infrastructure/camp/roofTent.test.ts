import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { FoldRoofTent } from "../../../src/application/camp/foldRoofTent";
import { PaintRoofTent } from "../../../src/application/camp/paintRoofTent";
import { PlaceRoofTent } from "../../../src/application/camp/placeRoofTent";
import { RoofTentHostGuard } from "../../../src/application/camp/roofTentHostGuard";
import type { VehicleHostState } from "../../../src/application/shared/ports/vehicleHost";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { PAINTS } from "../../../src/domain/shared/paint";
import { BedrockRoofTentOccupantWorld } from "../../../src/infrastructure/camp/bedrock/bedrockRoofTentOccupantWorld";
import { BedrockRoofTentWorld } from "../../../src/infrastructure/camp/bedrock/bedrockRoofTentWorld";
import { registerRoofTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentHits";
import { registerRoofTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentLifecycle";
import { registerRoofTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentPlacement";
import { registerTestRoofTent } from "../../../src/infrastructure/camp/bedrock/handlers/testRoofTent";
import { RoofTentHosts } from "../../../src/infrastructure/camp/bedrock/roofTentHosts";
import * as ids from "../../../src/infrastructure/camp/identifiers";
import { paintEvent } from "../../../src/infrastructure/shared/dyes";

const game = vi.hoisted(() => {
  const handlers = new Map<string, (ev: unknown) => void>();
  const events = (prefix: string) =>
    new Proxy(
      {},
      {
        get: (_, name: string) => ({
          subscribe: (callback: (ev: unknown) => void) =>
            handlers.set(prefix + name, callback),
        }),
      },
    );
  return {
    handlers,
    entities: new Map<string, Entity>(),
    run: vi.fn(),
    runInterval: vi.fn(),
    tick: 0,
    before: events("before:"),
    after: events("after:"),
    script: events("script:"),
    dimension: {
      id: "minecraft:overworld",
      getBlock: vi.fn(),
      getEntities: vi.fn(),
      spawnEntity: vi.fn(),
      spawnItem: vi.fn(),
      playSound: vi.fn(),
    },
    Player: class {},
  };
});
vi.mock("@minecraft/server", () => ({
  world: {
    beforeEvents: game.before,
    afterEvents: game.after,
    getEntity: (id: string) => game.entities.get(id),
    getDimension: () => game.dimension,
  },
  system: {
    get currentTick() {
      return game.tick;
    },
    run: game.run,
    runInterval: game.runInterval,
    afterEvents: game.script,
  },
  Direction: { Up: "Up" },
  ScriptEventSource: { Server: "Server" },
  Player: game.Player,
  GameMode: { Creative: "Creative" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
const DIM = asDimensionId("minecraft:overworld");
const PLAYER = asPlayerId("player");
const MOUNT = {
  roofHeight: 2,
  anchor: { x: 0, z: 0 },
  entrance: { x: 2, z: 0 },
  ladder: true,
};
let state: VehicleHostState;
const host = vi.fn(() => state);
const bed = { clearSpawnPoint: vi.fn() };
let occupants: BedrockRoofTentOccupantWorld;
let tents: BedrockRoofTentWorld;

function entity(id = "tent", typeId = ids.ROOF_TENT_TYPE) {
  const props = new Map<string, unknown>();
  const value = {
    id,
    typeId,
    isValid: true,
    dimension: game.dimension,
    location: { x: 0.5, y: 2, z: 0.5 },
    getRotation: () => ({ x: 0, y: 0 }),
    setRotation: vi.fn(),
    getDynamicProperty: (name: string) => props.get(name),
    setDynamicProperty: (name: string, value: unknown) =>
      props.set(name, value),
    getProperty: (name: string) => props.get(name),
    setProperty: (name: string, value: unknown) => props.set(name, value),
    getComponent: vi.fn(),
    triggerEvent: vi.fn(),
    teleport: vi.fn(),
    remove: vi.fn(() => {
      value.isValid = false;
      game.entities.delete(id);
    }),
  };
  game.entities.set(id, value as never);
  return value;
}
function player() {
  const value = Object.assign(
    new game.Player(),
    entity("player", "minecraft:player"),
    {
      selectedSlotIndex: 0,
      getGameMode: (): string => "Survival",
      onScreenDisplay: { setActionBar: vi.fn() },
    },
  );
  game.entities.set("player", value as never);
  return value;
}
function fire(name: string, event: unknown) {
  const callback = game.handlers.get(name);
  if (!callback) throw new Error(`No handler: ${name}`);
  callback(event);
}
function spawn(hosted = true) {
  const tent = entity();
  game.dimension.spawnEntity.mockReturnValue(tent);
  tents.spawn(
    {
      host: hosted ? { kind: "vehicle", id: "host" } : { kind: "ground" },
      facing: 0,
      ladder: hosted,
    },
    { dimensionId: DIM, location: tent.location, yaw: 0 },
    "owner",
    "khaki",
  );
  return tent;
}
beforeEach(() => {
  vi.clearAllMocks();
  game.handlers.clear();
  game.entities.clear();
  game.tick = 1;
  state = {
    status: "present",
    dimensionId: DIM,
    location: { x: 0, y: 0, z: 0 },
    yaw: 0,
    mount: MOUNT,
    driverPresent: false,
    moving: false,
  };
  game.dimension.getEntities.mockImplementation(({ type }: { type: string }) =>
    [...game.entities.values()].filter((e) => e.typeId === type),
  );
  game.dimension.getBlock.mockImplementation((at: { y: number }) => ({
    isAir: at.y >= 0,
    isLiquid: false,
  }));
  occupants = new BedrockRoofTentOccupantWorld(host, bed as never, () => false);
  tents = new BedrockRoofTentWorld({
    isVehicleSpace: () => false,
    isCampSpace: () => false,
    spawned: (e) => occupants.remember(e, true),
    beforeRemove: (id) => {
      occupants.eject(id);
      occupants.removed(id, undefined);
    },
  });
});

it("spawns with the host marker, owner, paint and collision bounds selected by ladder", () => {
  fc.assert(
    fc.property(fc.constantFrom(...PAINTS), fc.boolean(), (paint, ladder) => {
      const tent = entity();
      game.dimension.spawnEntity.mockReturnValue(tent);
      expect(
        tents.spawn(
          { host: { kind: "vehicle", id: "host" }, facing: 90, ladder },
          { dimensionId: DIM, location: tent.location, yaw: 37 },
          "owner",
          paint,
        ),
      ).toBe("tent");
      expect(tent.getDynamicProperty(ids.ROOF_TENT_HOST_PROPERTY)).toBe(
        "vehicle:host",
      );
      expect(tents.ownerOf("tent")).toBe("owner");
      expect(tent.getProperty(ids.ROOF_TENT_LADDER_PROPERTY)).toBe(ladder);
      expect(tent.setRotation).toHaveBeenCalledWith({ x: 0, y: 37 });
      expect(tent.triggerEvent.mock.calls.map(([event]) => event)).toEqual(
        ladder
          ? ["yasu_ride:suv_bounds", paintEvent(paint)]
          : [paintEvent(paint)],
      );
    }),
  );
});
it("rolls back a failed spawn so placement can refund the item", () => {
  const tent = entity();
  game.dimension.spawnEntity.mockReturnValue(tent);
  tent.setRotation.mockImplementation(() => {
    throw new Error("unloaded");
  });
  expect(
    tents.spawn(
      { host: { kind: "ground" }, facing: 0, ladder: false },
      { dimensionId: DIM, location: tent.location, yaw: 0 },
      undefined,
      "khaki",
    ),
  ).toBeUndefined();
  expect(tent.remove).toHaveBeenCalledOnce();
});
it("reads every paint variant and rejects invalid or unrelated entities", () => {
  const tent = entity();
  fc.assert(
    fc.property(fc.integer({ min: 0, max: PAINTS.length - 1 }), (index) => {
      tent.getComponent.mockReturnValue({ value: index });
      expect(tents.paintOf("tent")).toBe(PAINTS[index]);
    }),
  );
  tent.isValid = false;
  expect(tents.paintOf("tent")).toBeUndefined();
  entity("other", "minecraft:cow");
  expect(tents.paintOf("other")).toBeUndefined();
});
it("returns an item to an online owner and drops it at the tent when offline", () => {
  const tent = spawn();
  const owner = player();
  const addItem = vi.fn();
  owner.getComponent.mockReturnValue({ container: { addItem } });
  tents.returnItem("tent", "player");
  expect(addItem).toHaveBeenCalledWith(
    expect.objectContaining({ typeId: ids.ROOF_TENT_ITEM, amount: 1 }),
  );
  tents.returnItem("tent", "offline");
  expect(game.dimension.spawnItem).toHaveBeenCalledWith(
    expect.objectContaining({ typeId: ids.ROOF_TENT_ITEM }),
    tent.location,
  );
});
it("rejects blocked and unloaded ground and occupied vehicle space", () => {
  game.dimension.getBlock.mockImplementation(({ y }: { y: number }) => ({
    isAir: y > 0,
    isLiquid: false,
  }));
  expect(tents.groundFree(DIM, { x: 0, y: 0, z: 0 })).toBe(true);
  game.dimension.getBlock.mockReturnValue(undefined);
  expect(tents.groundFree(DIM, { x: 0, y: 0, z: 0 })).toBe(false);
  game.dimension.getBlock.mockImplementation(() => {
    throw new Error("unloaded");
  });
  expect(tents.groundFree(DIM, { x: 0, y: 0, z: 0 })).toBe(false);
});
it("defers and deduplicates placement, leaving unsupported vehicle interactions uncancelled", () => {
  const place = new PlaceRoofTent(tents, host);
  const execute = vi.spyOn(place, "execute").mockReturnValue(true);
  registerRoofTentPlacement(place, host);
  const p = player();
  const event = () => ({
    player: p,
    target: { id: "host" },
    itemStack: { typeId: ids.ROOF_TENT_ITEM },
    cancel: false,
  });
  const first = event();
  fire("before:playerInteractWithEntity", first);
  fire("before:playerInteractWithEntity", event());
  expect(first.cancel).toBe(true);
  expect(game.run).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ target: { entityId: "host" } }),
  );
  state = { ...state, mount: undefined } as VehicleHostState;
  const unsupported = event();
  fire("before:playerInteractWithEntity", unsupported);
  expect(unsupported.cancel).toBe(false);
});
it.each(["roof_taken", "driver", "moving"] as const)(
  "leaves boarding uncancelled and silent when the roof is unavailable: %s",
  (reason) => {
    if (reason === "roof_taken") spawn();
    else {
      if (state.status !== "present") throw new Error("Expected present host");
      state = {
        ...state,
        driverPresent: reason === "driver",
        moving: reason === "moving",
      };
    }
    const place = new PlaceRoofTent(tents, host);
    const execute = vi.spyOn(place, "execute");
    registerRoofTentPlacement(place, host);
    const p = player();
    const ev = {
      player: p,
      target: { id: "host" },
      itemStack: { typeId: ids.ROOF_TENT_ITEM },
      cancel: false,
    };
    fire("before:playerInteractWithEntity", ev);
    expect(ev.cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(p.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
  },
);
it("uses only the first top-face ground interaction and shares the per-player tick dedupe", () => {
  registerRoofTentPlacement(new PlaceRoofTent(tents, host), host);
  const p = player();
  const ev = {
    player: p,
    itemStack: { typeId: ids.ROOF_TENT_ITEM },
    blockFace: "Up",
    block: { dimension: game.dimension, location: { x: 1, y: 0, z: 2 } },
    isFirstEvent: false,
    cancel: false,
  };
  fire("before:playerInteractWithBlock", ev);
  expect(game.run).not.toHaveBeenCalled();
  ev.isFirstEvent = true;
  fire("before:playerInteractWithBlock", ev);
  fire("before:playerInteractWithBlock", ev);
  expect(game.run).toHaveBeenCalledOnce();
});
it("routes a dye before folding and counts each swing once", () => {
  const tent = spawn();
  const p = player();
  const held = { typeId: "minecraft:red_dye", amount: 3 };
  const setItem = vi.fn();
  p.getComponent.mockReturnValue({
    container: { getItem: () => held, setItem },
  });
  registerRoofTentHits(new FoldRoofTent(tents), new PaintRoofTent(tents));
  const ev = { damagingEntity: p, hitEntity: tent };
  fire("after:entityHitEntity", ev);
  fire("after:entityHitEntity", ev);
  expect(setItem).toHaveBeenCalledOnce();
  expect(held.amount).toBe(2);
  expect(tent.remove).not.toHaveBeenCalled();
  p.getComponent.mockReturnValue(undefined);
  for (let i = 0; i < 2; i++) {
    game.tick++;
    fire("after:entityHitEntity", ev);
  }
  expect(tent.remove).not.toHaveBeenCalled();
  game.tick++;
  fire("after:entityHitEntity", ev);
  expect(tent.remove).toHaveBeenCalledOnce();
});
it("keeps unknown hosts and ejects, returns and clears spawn before removing a moving host's tent", () => {
  const tent = spawn();
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant("tent", asPlayerId("cow"));
  occupants.setSpawnSetBy("tent", PLAYER);
  expect(tent.getProperty(ids.ROOF_TENT_OCCUPIED_PROPERTY)).toBe(true);
  const guard = new RoofTentHostGuard(tents, host, occupants, occupants);
  state = { status: "unknown" };
  guard.check();
  expect(tent.remove).not.toHaveBeenCalled();
  state = { status: "removed" };
  guard.check();
  expect(cow.teleport).toHaveBeenCalledWith(
    { x: 3.5, y: 0, z: 0.5 },
    { dimension: game.dimension },
  );
  expect(bed.clearSpawnPoint).toHaveBeenCalledExactlyOnceWith(PLAYER, DIM, {
    x: 0,
    y: 2,
    z: 0,
  });
  expect(tent.getProperty(ids.ROOF_TENT_OCCUPIED_PROPERTY)).toBe(false);
  expect(game.dimension.spawnItem).toHaveBeenCalledOnce();
  expect(tent.remove).toHaveBeenCalledOnce();
  expect(cow.teleport.mock.invocationCallOrder[0]).toBeLessThan(
    tent.remove.mock.invocationCallOrder[0] ?? 0,
  );
});
it("runs the host guard at the specified interval and preserves unload bookkeeping", () => {
  const guard = new RoofTentHostGuard(tents, host, occupants, occupants);
  const check = vi.spyOn(guard, "check");
  registerRoofTentLifecycle(occupants, guard, new RoofTentHosts(host));
  expect(game.runInterval).toHaveBeenCalledWith(
    expect.any(Function),
    ROOF_TENT_SPEC.hostCheckTicks,
  );
  game.runInterval.mock.calls[0]?.[0]();
  expect(check).toHaveBeenCalledOnce();
  const tent = spawn();
  occupants.setSpawnSetBy("tent", PLAYER);
  fire("before:entityRemove", { removedEntity: tent });
  tent.remove();
  game.dimension.getBlock.mockReturnValue(undefined);
  game.run.mock.calls[0]?.[0]();
  expect(bed.clearSpawnPoint).not.toHaveBeenCalled();
});
it("cleans occupancy and spawn after an external removal in a loaded chunk", () => {
  const tent = spawn();
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant("tent", asPlayerId("cow"));
  occupants.setSpawnSetBy("tent", PLAYER);
  registerRoofTentLifecycle(
    occupants,
    new RoofTentHostGuard(tents, host, occupants, occupants),
    new RoofTentHosts(host),
  );
  fire("before:entityRemove", { removedEntity: tent });
  tent.remove();
  game.run.mock.calls[0]?.[0]();
  expect(cow.teleport).toHaveBeenCalledOnce();
  expect(bed.clearSpawnPoint).toHaveBeenCalledOnce();
});
it("restricts test hooks to the server and seats stand-ins through the adapters", () => {
  const place = new PlaceRoofTent(tents, host);
  const execute = vi.spyOn(place, "execute").mockReturnValue(true);
  const guard = new RoofTentHostGuard(tents, host, occupants, occupants);
  registerTestRoofTent(
    place,
    new FoldRoofTent(tents),
    guard,
    occupants,
    new RoofTentHosts(host),
  );
  const hook = (id: string, message: string, sourceType = "Server") =>
    fire("script:scriptEventReceive", { id, message, sourceType });
  hook(ids.TEST_ROOF_TENT_PLACE_EVENT, "0 0 0 0", "Entity");
  expect(execute).not.toHaveBeenCalled();
  hook(ids.TEST_ROOF_TENT_PLACE_EVENT, "0 0 0 0");
  expect(execute).toHaveBeenCalledOnce();
  hook(ids.TEST_ROOF_TENT_PLACE_EVENT, "0 NaN 0 0");
  expect(execute).toHaveBeenCalledOnce();
  spawn();
  const cow = entity("cow", "minecraft:cow");
  hook(ids.TEST_ROOF_TENT_OCCUPANT_SEAT_EVENT, "tent cow");
  expect(occupants.occupantOf("tent")).toBe("cow");
  expect(cow.teleport).toHaveBeenCalledOnce();
  const vehicle = entity("host", "yasu_ride:suv");
  hook(ids.TEST_ROOF_TENT_DRIVER_SEAT_EVENT, "host cow");
  hook(ids.TEST_ROOF_TENT_HOST_REMOVE_EVENT, "host");
  expect(vehicle.remove).toHaveBeenCalledOnce();
});

it("converts a positively loaded host removal into guard evidence without treating unloads as removals", () => {
  const hosts = new RoofTentHosts(host);
  const guard = new RoofTentHostGuard(
    tents,
    hosts.lookup,
    occupants,
    occupants,
  );
  registerRoofTentLifecycle(occupants, guard, hosts);
  const vehicle = entity("host", "yasu_ride:suv");
  const tent = spawn();
  fire("before:entityRemove", { removedEntity: vehicle });
  vehicle.remove();
  state = { status: "unknown" };
  game.dimension.getBlock.mockReturnValue(undefined);
  game.run.mock.calls[0]?.[0]();
  expect(hosts.lookup("host")).toEqual({ status: "unknown" });
  expect(tent.remove).not.toHaveBeenCalled();
  state = {
    status: "present",
    dimensionId: DIM,
    location: { x: 0, y: 0, z: 0 },
    yaw: 0,
    mount: MOUNT,
    moving: false,
    driverPresent: false,
  };
  const loaded = entity("host", "yasu_ride:suv");
  fire("after:entityLoad", { entity: loaded });
  fire("before:entityRemove", { removedEntity: loaded });
  loaded.remove();
  state = { status: "unknown" };
  game.dimension.getBlock.mockReturnValue({ isAir: true });
  game.run.mock.calls[1]?.[0]();
  expect(hosts.lookup("host")).toEqual({ status: "removed" });
  expect(tent.remove).toHaveBeenCalledOnce();
});
it("recognizes a test driver only while its stand-in is valid", () => {
  const hosts = new RoofTentHosts(host);
  const cow = entity("cow", "minecraft:cow");
  hosts.testDriver("host", "cow");
  expect(hosts.lookup("host")).toEqual({ ...state, driverPresent: true });
  cow.remove();
  expect(hosts.lookup("host")).toEqual(state);
});

it("consumes and refunds only the captured roof tent slot on a failed Survival placement", () => {
  const p = player();
  const held = { typeId: ids.ROOF_TENT_ITEM, amount: 2 };
  const setItem = vi.fn();
  const addItem = vi.fn();
  p.getComponent.mockReturnValue({
    container: { getItem: () => held, setItem, addItem },
  });
  game.dimension.spawnEntity.mockImplementationOnce(() => {
    throw new Error("unloaded");
  });
  const place = new PlaceRoofTent(tents, host);
  expect(
    place.execute({
      playerId: PLAYER,
      dimensionId: DIM,
      target: { entityId: "host" },
      yaw: 0,
      slot: 3,
    }),
  ).toBe(false);
  expect(setItem).toHaveBeenCalledExactlyOnceWith(3, held);
  expect(held.amount).toBe(1);
  expect(addItem).toHaveBeenCalledWith(
    expect.objectContaining({ typeId: ids.ROOF_TENT_ITEM, amount: 1 }),
  );
});
it("keeps Creative items and dyes and ignores painting the existing color", () => {
  const tent = spawn();
  const p = player();
  p.getGameMode = () => "Creative";
  const consume = vi.spyOn(tents, "consumeDye");
  const takeItem = vi.spyOn(tents, "consumeItem");
  const paint = new PaintRoofTent(tents);
  expect(
    paint.execute({
      playerId: PLAYER,
      tentId: "tent",
      paint: "khaki",
      tick: 1,
    }),
  ).toBe(false);
  expect(
    paint.execute({ playerId: PLAYER, tentId: "tent", paint: "red", tick: 2 }),
  ).toBe(true);
  expect(consume).not.toHaveBeenCalled();
  tent.setDynamicProperty(ids.ROOF_TENT_HOST_PROPERTY, "");
  const second = entity("second");
  game.dimension.spawnEntity.mockReturnValue(second);
  expect(
    new PlaceRoofTent(tents, host).execute({
      playerId: PLAYER,
      dimensionId: DIM,
      target: { entityId: "host" },
      yaw: 0,
      slot: 0,
    }),
  ).toBe(true);
  expect(takeItem).not.toHaveBeenCalled();
});
it("folding also ejects occupants and clears the matching sleeper spawn", () => {
  const tent = spawn(false);
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant("tent", asPlayerId("cow"));
  occupants.setSpawnSetBy("tent", PLAYER);
  const fold = new FoldRoofTent(tents);
  for (const tick of [1, 2, 3]) fold.execute({ tentId: "tent", tick });
  expect(cow.teleport).toHaveBeenCalledOnce();
  expect(bed.clearSpawnPoint).toHaveBeenCalledOnce();
  expect(tent.getProperty(ids.ROOF_TENT_FLAP_OPEN_PROPERTY)).toBe(false);
  expect(bed.clearSpawnPoint.mock.invocationCallOrder[0]).toBeLessThan(
    tent.remove.mock.invocationCallOrder[0] ?? 0,
  );
});
it.each(["moving", "driverPresent"] as const)(
  "removes hosted tents when %s is true",
  (flag) => {
    const tent = spawn();
    state = { ...state, [flag]: true } as VehicleHostState;
    new RoofTentHostGuard(tents, host, occupants, occupants).check();
    expect(tent.remove).toHaveBeenCalledOnce();
  },
);
it("rebuilds saved occupant state and rejects vehicle-space exit candidates", () => {
  const tent = spawn();
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant("tent", asPlayerId("cow"));
  occupants.setSpawnSetBy("tent", PLAYER);
  const space = vi.fn((_d: unknown, cell: { x: number }) => cell.x === 3);
  const restored = new BedrockRoofTentOccupantWorld(host, bed as never, space);
  restored.remember(tent as never);
  expect(restored.occupantOf("tent")).toBe("cow");
  expect(restored.spawnSetBy("tent")).toBe(PLAYER);
  restored.eject("tent");
  expect(cow.teleport).toHaveBeenCalledWith(
    expect.objectContaining({ x: 2.5 }),
    expect.anything(),
  );
  expect(space).toHaveBeenCalled();
});
it("checks neighboring cells within the fixed ground collision box", () => {
  game.dimension.getBlock.mockImplementation(
    (at: { x: number; y: number }) => ({
      isAir: at.y > 0 && at.x !== 1,
      isLiquid: false,
    }),
  );
  expect(tents.groundFree(DIM, { x: 0, y: 0, z: 0 })).toBe(false);
});

it("maps roof placement refusals and fold counts to existing localized tent messages", () => {
  const p = player();
  for (const name of ["blocked", "roof_taken"]) {
    tents.showMessage(PLAYER, name);
    expect(p.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
      translate: ids.PITCH_REFUSAL_MESSAGE.blocked,
    });
  }
  tents.showMessage(PLAYER, "hits_left:2");
  expect(p.onScreenDisplay.setActionBar).toHaveBeenLastCalledWith({
    translate: ids.TENT_HITS_LEFT_HINT,
    with: ["2"],
  });
});
