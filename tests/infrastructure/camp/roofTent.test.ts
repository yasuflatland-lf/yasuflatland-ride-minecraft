import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { FoldRoofTent } from "../../../src/application/camp/foldRoofTent";
import { PaintRoofTent } from "../../../src/application/camp/paintRoofTent";
import { PlaceRoofTent } from "../../../src/application/camp/placeRoofTent";
import { RoofTentHostGuard } from "../../../src/application/camp/roofTentHostGuard";
import type { VehicleHostState } from "../../../src/application/shared/ports/vehicleHost";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { roofTentCeilingCells } from "../../../src/domain/camp/roofTent/ceiling";
import { seatPosition } from "../../../src/domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../src/domain/shared/ids";
import { PAINTS } from "../../../src/domain/shared/paint";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
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
  BlockPermutation: { resolve: (typeId: string) => ({ typeId }) },
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
    addEffect: vi.fn(),
    removeEffect: vi.fn(),
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
      host: hosted
        ? { kind: "vehicle", id: asVehicleId("host") }
        : { kind: "ground" },
      facing: 0,
      ladder: hosted,
    },
    { dimensionId: DIM, location: tent.location, yaw: 0 },
    asPlayerId("owner"),
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
    setPermutation: vi.fn(),
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
          {
            host: { kind: "vehicle", id: asVehicleId("host") },
            facing: 90,
            ladder,
          },
          { dimensionId: DIM, location: tent.location, yaw: 37 },
          asPlayerId("owner"),
          paint,
        ),
      ).toBe("tent");
      expect(tent.getDynamicProperty(ids.ROOF_TENT_HOST_PROPERTY)).toBe(
        "vehicle:host",
      );
      expect(tents.ownerOf(asRoofTentId("tent"))).toBe("owner");
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
it("places the SUV tent at its shifted left anchor with the model front at -z", () => {
  state = { ...state, mount: SUV_PROFILE.roofTent } as VehicleHostState;
  const tent = entity();
  game.dimension.spawnEntity.mockReturnValue(tent);
  const place = new PlaceRoofTent(tents, host);
  expect(
    place.execute({
      dimensionId: DIM,
      target: { entityId: asVehicleId("host") },
      yaw: 0,
      slot: 0,
    }),
  ).toBe(true);
  expect(game.dimension.spawnEntity.mock.calls[0]?.[0]).toBe(
    ids.ROOF_TENT_TYPE,
  );
  const location = game.dimension.spawnEntity.mock.calls[0]?.[1];
  expect(location?.x).toBeCloseTo(1.1658106831395347, 10);
  expect(location?.y).toBeCloseTo((26.1 * 1.45) / 16, 10);
  expect(location?.z).toBeCloseTo(-1.0770148982558139, 10);
  expect(tent.triggerEvent).toHaveBeenCalledWith("yasu_ride:suv_bounds");
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
      expect(tents.paintOf(asRoofTentId("tent"))).toBe(PAINTS[index]);
    }),
  );
  tent.isValid = false;
  expect(tents.paintOf(asRoofTentId("tent"))).toBeUndefined();
  entity("other", "minecraft:cow");
  expect(tents.paintOf(asRoofTentId("other"))).toBeUndefined();
});
it("returns an item to an online owner and drops it at the tent when offline", () => {
  const tent = spawn();
  const owner = player();
  const addItem = vi.fn();
  owner.getComponent.mockReturnValue({ container: { addItem } });
  tents.returnItem(asRoofTentId("tent"), asPlayerId("player"));
  expect(addItem).toHaveBeenCalledWith(
    expect.objectContaining({ typeId: ids.ROOF_TENT_ITEM, amount: 1 }),
  );
  tents.returnItem(asRoofTentId("tent"), asPlayerId("offline"));
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
    expect.objectContaining({ target: { entityId: asVehicleId("host") } }),
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
  occupants.setOccupant(asRoofTentId("tent"), asPlayerId("cow"));
  occupants.addSpawnSetter(asRoofTentId("tent"), PLAYER);
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
  occupants.addSpawnSetter(asRoofTentId("tent"), PLAYER);
  fire("before:entityRemove", { removedEntity: tent });
  tent.remove();
  game.dimension.getBlock.mockReturnValue(undefined);
  game.run.mock.calls[0]?.[0]();
  expect(bed.clearSpawnPoint).not.toHaveBeenCalled();
});
it("cleans occupancy and spawn after an external removal in a loaded chunk", () => {
  const tent = spawn();
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant(asRoofTentId("tent"), asPlayerId("cow"));
  occupants.addSpawnSetter(asRoofTentId("tent"), PLAYER);
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
  expect(occupants.occupantOf(asRoofTentId("tent"))).toBe("cow");
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
      target: { entityId: asVehicleId("host") },
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
      tentId: asRoofTentId("tent"),
      paint: "khaki",
      tick: 1,
    }),
  ).toBe(false);
  expect(
    paint.execute({
      playerId: PLAYER,
      tentId: asRoofTentId("tent"),
      paint: "red",
      tick: 2,
    }),
  ).toBe(true);
  expect(consume).not.toHaveBeenCalled();
  tent.setDynamicProperty(ids.ROOF_TENT_HOST_PROPERTY, "");
  const second = entity("second");
  game.dimension.spawnEntity.mockReturnValue(second);
  expect(
    new PlaceRoofTent(tents, host).execute({
      playerId: PLAYER,
      dimensionId: DIM,
      target: { entityId: asVehicleId("host") },
      yaw: 0,
      slot: 0,
    }),
  ).toBe(true);
  expect(takeItem).not.toHaveBeenCalled();
});
it("folding also ejects occupants and clears the matching sleeper spawn", () => {
  const tent = spawn(false);
  const cow = entity("cow", "minecraft:cow");
  occupants.setOccupant(asRoofTentId("tent"), asPlayerId("cow"));
  occupants.addSpawnSetter(asRoofTentId("tent"), PLAYER);
  const fold = new FoldRoofTent(tents);
  for (const tick of [1, 2, 3])
    fold.execute({ tentId: asRoofTentId("tent"), tick });
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
  occupants.setOccupant(asRoofTentId("tent"), asPlayerId("cow"));
  occupants.addSpawnSetter(asRoofTentId("tent"), PLAYER);
  const space = vi.fn((_d: unknown, cell: { x: number }) => cell.x === 3);
  const restored = new BedrockRoofTentOccupantWorld(host, bed as never, space);
  restored.remember(tent as never);
  expect(restored.occupantOf(asRoofTentId("tent"))).toBe("cow");
  expect(restored.spawnSetters(asRoofTentId("tent"))).toEqual([PLAYER]);
  restored.eject(asRoofTentId("tent"));
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

it("teleports entrants near the seat before adding the rider", () => {
  const tent = spawn();
  const p = player();
  const addRider = vi.fn(() => true);
  tent.getComponent.mockReturnValue({ addRider });
  occupants.moveInside(PLAYER, asRoofTentId("tent"));
  expect(p.teleport).toHaveBeenCalledExactlyOnceWith(
    seatPosition(tent.location),
    { dimension: game.dimension },
  );
  expect(addRider).toHaveBeenCalledExactlyOnceWith(p);
  expect(p.teleport.mock.invocationCallOrder[0]).toBeLessThan(
    addRider.mock.invocationCallOrder[0] ?? 0,
  );
  expect(p.setRotation).not.toHaveBeenCalled();
});

it.each(["unavailable", "false", "throws"])(
  "falls back to teleporting to the seat when addRider is %s",
  (failure) => {
    const tent = spawn();
    const p = player();
    const addRider = vi.fn(() => {
      if (failure === "throws") throw new Error("Cannot seat rider");
      return false;
    });
    if (failure !== "unavailable")
      tent.getComponent.mockReturnValue({ addRider });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() =>
        occupants.moveInside(PLAYER, asRoofTentId("tent")),
      ).not.toThrow();
      expect(p.teleport).toHaveBeenLastCalledWith(seatPosition(tent.location), {
        dimension: game.dimension,
      });
      expect(p.teleport).toHaveBeenCalledTimes(
        failure === "unavailable" ? 1 : 2,
      );
    } finally {
      warning.mockRestore();
    }
  },
);

it("recognizes only the tent's rider and leaves an already seated player in place", () => {
  const tent = spawn();
  const p = player();
  expect(occupants.isSeated(PLAYER, asRoofTentId("tent"))).toBe(false);
  p.getComponent.mockReturnValue({ entityRidingOn: { id: "other" } });
  expect(occupants.isSeated(PLAYER, asRoofTentId("tent"))).toBe(false);
  p.getComponent.mockReturnValue({ entityRidingOn: tent });
  expect(occupants.isSeated(PLAYER, asRoofTentId("tent"))).toBe(true);
  occupants.moveInside(PLAYER, asRoofTentId("tent"));
  expect(p.teleport).not.toHaveBeenCalled();
  expect(tent.getComponent).not.toHaveBeenCalled();
  game.entities.delete("tent");
  expect(occupants.isSeated(PLAYER, asRoofTentId("tent"))).toBeUndefined();
});

it.each([true, false])(
  "places an occupant outside when still seated is %s",
  (seated) => {
    const tent = spawn();
    const p = player();
    const ejectRider = vi.fn();
    tent.getComponent.mockReturnValue({ ejectRider });
    if (seated) p.getComponent.mockReturnValue({ entityRidingOn: tent });
    occupants.placeOutside(PLAYER, asRoofTentId("tent"));
    expect(ejectRider).toHaveBeenCalledTimes(seated ? 1 : 0);
    if (seated) {
      expect(ejectRider).toHaveBeenCalledWith(p);
      expect(ejectRider.mock.invocationCallOrder[0]).toBeLessThan(
        p.teleport.mock.invocationCallOrder[0] ?? 0,
      );
    }
    expect(p.teleport).toHaveBeenCalledExactlyOnceWith(
      { x: 3.5, y: 0, z: 0.5 },
      { dimension: game.dimension },
    );
  },
);

it("conceals with a short particle-free effect and reveals the occupant", () => {
  const p = player();
  occupants.conceal(PLAYER);
  occupants.conceal(PLAYER);
  expect(p.addEffect.mock.calls).toEqual(
    Array.from({ length: 2 }, () => [
      "invisibility",
      ROOF_TENT_SPEC.concealTicks,
      { amplifier: 0, showParticles: false },
    ]),
  );
  occupants.reveal(PLAYER);
  expect(p.removeEffect).toHaveBeenCalledExactlyOnceWith("invisibility");
});

it("ignores offline or invalid players and tolerates effect API failures", () => {
  occupants.conceal(PLAYER);
  occupants.reveal(PLAYER);
  const p = player();
  p.isValid = false;
  occupants.conceal(PLAYER);
  occupants.reveal(PLAYER);
  expect(p.addEffect).not.toHaveBeenCalled();
  expect(p.removeEffect).not.toHaveBeenCalled();
  p.isValid = true;
  p.addEffect.mockImplementation(() => {
    throw new Error("Invalid player");
  });
  p.removeEffect.mockImplementation(() => {
    throw new Error("Invalid player");
  });
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(() => occupants.conceal(PLAYER)).not.toThrow();
    expect(() => occupants.reveal(PLAYER)).not.toThrow();
    expect(warning).toHaveBeenCalledTimes(2);
  } finally {
    warning.mockRestore();
  }
});

it("reveals on ejection even when no safe exit exists, and on forgetting an unloaded tent", () => {
  spawn();
  const p = player();
  occupants.setOccupant(asRoofTentId("tent"), PLAYER);
  game.dimension.getBlock.mockReturnValue(undefined);
  occupants.eject(asRoofTentId("tent"));
  expect(p.teleport).not.toHaveBeenCalled();
  expect(p.removeEffect).toHaveBeenCalledExactlyOnceWith("invisibility");
  expect(occupants.occupantOf(asRoofTentId("tent"))).toBeUndefined();
  occupants.setOccupant(asRoofTentId("tent"), PLAYER);
  occupants.forget(asRoofTentId("tent"));
  expect(p.removeEffect).toHaveBeenCalledTimes(2);
});

function ceilingTerrain() {
  const blocks = new Map<string, string>();
  const missing = new Set<string>();
  const throwing = new Set<string>();
  game.dimension.getBlock.mockImplementation((cell: Cell) => {
    const key = cellKey(cell);
    if (throwing.has(key)) throw new Error("Unloaded chunk");
    if (missing.has(key)) return undefined;
    const typeId = blocks.get(key) ?? "minecraft:air";
    return {
      typeId,
      isAir: typeId === "minecraft:air",
      setPermutation: ({ typeId }: { typeId: string }) =>
        blocks.set(key, typeId),
    };
  });
  return { blocks, missing, throwing };
}
function savedCeiling(tent: ReturnType<typeof entity>): Cell[] {
  return JSON.parse(
    tent.getDynamicProperty(ids.ROOF_TENT_CEILING_PROPERTY) as string,
  );
}

it.each([true, false])(
  "lays and records the rotated ceiling on entry with ladder %s, then clears only its own blocks",
  (ladder) => {
    const tent = spawn(ladder);
    tent.getRotation = () => ({ x: 0, y: 37 });
    const { blocks } = ceilingTerrain();
    const cells = roofTentCeilingCells(
      tent.location,
      37,
      ladder ? "ladder" : "ground",
    );
    occupants.setOccupant(asRoofTentId("tent"), PLAYER);
    expect(savedCeiling(tent)).toEqual(cells);
    expect([...blocks.keys()].sort()).toEqual(cells.map(cellKey).sort());
    occupants.syncCeiling(asRoofTentId("tent"));
    expect(savedCeiling(tent)).toEqual(cells);
    const replaced = cells[0] as Cell;
    blocks.set(cellKey(replaced), "minecraft:stone");
    occupants.setOccupant(asRoofTentId("tent"), undefined);
    expect(blocks.get(cellKey(replaced))).toBe("minecraft:stone");
    for (const cell of cells.slice(1))
      expect(blocks.get(cellKey(cell))).toBe("minecraft:air");
    expect(
      tent.getDynamicProperty(ids.ROOF_TENT_CEILING_PROPERTY),
    ).toBeUndefined();
  },
);

it("skips occupied, missing, unloaded and vehicle-space cells without losing successful cells", () => {
  const tent = spawn();
  const { blocks, missing, throwing } = ceilingTerrain();
  const cells = roofTentCeilingCells(tent.location, 0, "ladder");
  const [solid, absent, unloaded, vehicle] = cells as [
    Cell,
    Cell,
    Cell,
    Cell,
    ...Cell[],
  ];
  blocks.set(cellKey(solid), "minecraft:stone");
  missing.add(cellKey(absent));
  throwing.add(cellKey(unloaded));
  const space = vi.fn(
    (_dimension: unknown, cell: Cell) => cellKey(cell) === cellKey(vehicle),
  );
  const adapter = new BedrockRoofTentOccupantWorld(host, bed as never, space);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    adapter.setOccupant(asRoofTentId("tent"), PLAYER);
    expect(savedCeiling(tent)).toEqual(cells.slice(4));
    expect(blocks.get(cellKey(solid))).toBe("minecraft:stone");
    expect(blocks.has(cellKey(vehicle))).toBe(false);
    expect(space).toHaveBeenCalledWith(DIM, vehicle);
    expect(warn).toHaveBeenCalledOnce();
  } finally {
    warn.mockRestore();
  }
});

it.each(["forget", "removed"] as const)(
  "clears a saved ceiling through %s after the entity is gone",
  (method) => {
    const tent = spawn();
    const { blocks } = ceilingTerrain();
    occupants.setOccupant(asRoofTentId("tent"), PLAYER);
    const cells = savedCeiling(tent);
    // A fresh adapter must recover the cells from the persisted entity property.
    const restored = new BedrockRoofTentOccupantWorld(
      host,
      bed as never,
      () => false,
    );
    restored.remember(tent as never);
    tent.remove();
    if (method === "removed") restored.removed(asRoofTentId("tent"), undefined);
    else restored.forget(asRoofTentId("tent"));
    for (const cell of cells)
      expect(blocks.get(cellKey(cell))).toBe("minecraft:air");
    expect(
      restored.ceilingOwner(DIM, cells[0] as Cell, ids.TENT_CEILING_BLOCK),
    ).toBeUndefined();
  },
);

it("restores occupied ceilings and clears unoccupied saved ceilings after reload", () => {
  const tent = spawn();
  const { blocks } = ceilingTerrain();
  tent.setDynamicProperty(ids.ROOF_TENT_OCCUPANT_PROPERTY, PLAYER);
  occupants.syncCeiling(asRoofTentId("tent"));
  const cells = savedCeiling(tent);
  const restored = new BedrockRoofTentOccupantWorld(
    host,
    bed as never,
    () => false,
  );
  tent.setDynamicProperty(ids.ROOF_TENT_OCCUPANT_PROPERTY, undefined);
  restored.syncCeiling(asRoofTentId("tent"));
  for (const cell of cells)
    expect(blocks.get(cellKey(cell))).toBe("minecraft:air");
  game.dimension.getBlock.mockClear();
  restored.syncCeiling(asRoofTentId("tent"));
  expect(game.dimension.getBlock).not.toHaveBeenCalled();
});

it("guards only recorded ceiling cells in their tent's dimension", () => {
  const tent = spawn();
  ceilingTerrain();
  occupants.setOccupant(asRoofTentId("tent"), PLAYER);
  const cell = savedCeiling(tent)[0] as Cell;
  expect(occupants.ceilingOwner(DIM, cell, ids.TENT_CEILING_BLOCK)).toBe(
    "tent",
  );
  expect(occupants.ceilingOwner(DIM, cell, "minecraft:stone")).toBeUndefined();
  expect(
    occupants.ceilingOwner(
      asDimensionId("minecraft:nether"),
      cell,
      ids.TENT_CEILING_BLOCK,
    ),
  ).toBeUndefined();
  expect(
    occupants.ceilingOwner(
      DIM,
      { ...cell, y: cell.y + 1 },
      ids.TENT_CEILING_BLOCK,
    ),
  ).toBeUndefined();
});

it.each(["not json", "null", "{}", '[null, {}, {"x":0,"y":1.5,"z":0}]'])(
  "ignores malformed saved ceiling cells: %s",
  (saved) => {
    const tent = spawn();
    tent.setDynamicProperty(ids.ROOF_TENT_CEILING_PROPERTY, saved);
    game.dimension.getBlock.mockClear();
    occupants.syncCeiling(asRoofTentId("tent"));
    expect(game.dimension.getBlock).not.toHaveBeenCalled();
  },
);

it.each([
  [undefined, [PLAYER]],
  [JSON.stringify(["first", "second", "first"]), ["first", "second", PLAYER]],
  [JSON.stringify(["first", PLAYER]), ["first", PLAYER]],
  ["{malformed", [PLAYER]],
  [JSON.stringify({ id: "wrong shape" }), [PLAYER]],
  [JSON.stringify(["first", 42]), [PLAYER]],
  [JSON.stringify([]), [PLAYER]],
])(
  "reads saved spawn setters merged with the legacy id: %s",
  (stored, expected) => {
    const tent = spawn();
    tent.setDynamicProperty(ids.ROOF_TENT_SPAWN_SET_BY_PROPERTY, PLAYER);
    tent.setDynamicProperty(ids.ROOF_TENT_SPAWN_SETTERS_PROPERTY, stored);
    const restored = new BedrockRoofTentOccupantWorld(
      host,
      bed as never,
      () => false,
    );
    restored.remember(tent as never);
    expect(restored.spawnSetters(asRoofTentId("tent"))).toEqual(expected);
  },
);

it("merges legacy setters, writes the latest legacy id, and clears both properties", () => {
  const tent = spawn();
  const id = asRoofTentId("tent");
  const next = asPlayerId("next");
  tent.setDynamicProperty(ids.ROOF_TENT_SPAWN_SET_BY_PROPERTY, PLAYER);
  occupants.addSpawnSetter(id, next);
  occupants.addSpawnSetter(id, PLAYER);
  expect(tent.getDynamicProperty(ids.ROOF_TENT_SPAWN_SETTERS_PROPERTY)).toBe(
    JSON.stringify([PLAYER, next]),
  );
  expect(tent.getDynamicProperty(ids.ROOF_TENT_SPAWN_SET_BY_PROPERTY)).toBe(
    PLAYER,
  );
  expect(occupants.spawnSetters(id)).toEqual([PLAYER, next]);
  occupants.clearSpawnSetters(id);
  expect(
    tent.getDynamicProperty(ids.ROOF_TENT_SPAWN_SETTERS_PROPERTY),
  ).toBeUndefined();
  expect(
    tent.getDynamicProperty(ids.ROOF_TENT_SPAWN_SET_BY_PROPERTY),
  ).toBeUndefined();
  expect(occupants.spawnSetters(id)).toEqual([]);
  tent.remove();
  expect(occupants.spawnSetters(id)).toEqual([]);
});
