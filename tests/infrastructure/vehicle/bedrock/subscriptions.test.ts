import {
  type BlockCustomComponent,
  type EntityDieAfterEvent,
  type EntityHitEntityAfterEvent,
  type EntityLoadAfterEvent,
  type EntityRemoveBeforeEvent,
  type EntitySpawnAfterEvent,
  type ItemUseAfterEvent,
  Player,
  type PlayerBreakBlockBeforeEvent,
  type PlayerInteractWithBlockBeforeEvent,
  type PlayerInteractWithEntityBeforeEvent,
  type PlayerSpawnAfterEvent,
  type ScriptEventCommandMessageAfterEvent,
  type StartupEvent,
  system,
  world,
} from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceVehicle } from "../../../../src/application/vehicle/placeVehicle";
import type { PlacementWorld } from "../../../../src/application/vehicle/ports/placement";
import { asVehicleId, type VehicleId } from "../../../../src/domain/shared/ids";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import type { VehicleRepository } from "../../../../src/domain/vehicle/vehicleRepository";
import { PAINT_BY_DYE } from "../../../../src/infrastructure/shared/dyes";
import { HEADLIGHT_SWITCH_TYPE } from "../../../../src/infrastructure/shared/identifiers";
import type { SwitchTarget } from "../../../../src/infrastructure/shared/switchRouter";
import {
  BLADE_SWITCH_TYPE,
  CAMPER_BED_COMPONENT,
  CAMPER_CABINET_COMPONENT,
  CAMPER_DECOR_COMPONENT,
  CAMPER_DOOR_COMPONENT,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_SHOWER_TOILET_COMPONENT,
  CAMPER_WALL_BLOCK,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  decorBlockId,
  ENTITY_TYPE,
  GIFT_ITEM,
  ITEM_TYPE,
  OWNER_PROPERTY,
  pairDecorBlockId,
  STAND_IN_OF_PROPERTY,
  STAND_IN_PROPERTY,
  standInType,
  TEST_BLADE_EVENT,
  TEST_DECOR_EVENT,
  TEST_INPUT_EVENT,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { registerSubscriptions } from "../../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";
import { defined } from "../../../support/defined";

const game = vi.hoisted(() => ({
  before:
    vi.fn<
      (handler: (ev: PlayerInteractWithBlockBeforeEvent) => void) => void
    >(),
  use: vi.fn<(handler: (ev: ItemUseAfterEvent) => void) => void>(),
  breakBlock:
    vi.fn<(handler: (ev: PlayerBreakBlockBeforeEvent) => void) => void>(),
  run: vi.fn<(callback: () => void) => void>(),
  startup: vi.fn<(handler: (ev: StartupEvent) => void) => void>(),
  currentTick: 10,
  getEntity: vi.fn<(id: string) => unknown>(),
}));
vi.mock("@minecraft/server", () => {
  const signal = () => ({ subscribe: vi.fn() });
  return {
    Direction: {
      Up: "Up",
      Down: "Down",
      North: "North",
      South: "South",
      East: "East",
      West: "West",
    },
    EntityInitializationCause: { Loaded: "Loaded", Spawned: "Spawned" },
    InputMode: { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" },
    ScriptEventSource: { Server: "Server", Entity: "Entity" },
    Player: class {},
    system: {
      get currentTick() {
        return game.currentTick;
      },
      run: game.run,
      runInterval: vi.fn(),
      beforeEvents: { startup: { subscribe: game.startup } },
      afterEvents: { scriptEventReceive: signal() },
    },
    world: {
      getEntity: game.getEntity,
      beforeEvents: {
        playerInteractWithBlock: { subscribe: game.before },
        playerInteractWithEntity: signal(),
        playerBreakBlock: { subscribe: game.breakBlock },
        entityRemove: signal(),
      },
      afterEvents: {
        itemUse: { subscribe: game.use },
        entityLoad: signal(),
        entitySpawn: signal(),
        entityDie: signal(),
        playerSpawn: signal(),
        entityHitEntity: signal(),
      },
    },
  };
});

const FACES = ["Up", "Down", "North", "South", "East", "West"] as const;
type At = { x: number; y: number; z: number };

// The clicked block sits at y 5 with `depth` water cells above it at every x/z,
// unless `water` says otherwise. The view ray hits the water cell at y 7.
function fixture(
  typeId = ITEM_TYPE.sportsboat,
  depth = 3,
  water = (at: At) => at.y > 5 && at.y <= 5 + depth,
) {
  const dimension = {
    id: "overworld",
    getBlock: vi.fn((at: At) => ({
      typeId: water(at) ? "minecraft:water" : "minecraft:air",
      isWaterlogged: false,
    })),
  };
  const block = { dimension, location: { x: 2, y: 5, z: 3 } };
  const rayBlock = { dimension, location: { x: 2, y: 7, z: 3 } };
  const player = {
    id: "player",
    isValid: true,
    dimension,
    location: { x: 2.5, y: 8, z: 3.5 },
    selectedSlotIndex: 2,
    getRotation: () => ({ y: -90 }),
    getBlockFromViewDirection: vi.fn<
      () => { block: typeof block; face: string } | undefined
    >(() => ({ block: rayBlock, face: "Up" })),
    getComponent: (name: string) =>
      name === "minecraft:riding"
        ? { entityRidingOn: { id: "vehicle", typeId: ENTITY_TYPE.suv } }
        : undefined,
  };
  const waterDimensions: string[] = [];
  const notUsed = (): never => {
    throw new Error("not used by cellFor or placesOnWater");
  };
  const placementWorld: PlacementWorld = {
    isCampSpace: notUsed,
    isAir: notUsed,
    isCreative: notUsed,
    isWaterAt: (dimensionId, at) => {
      waterDimensions.push(dimensionId);
      return water(at);
    },
    spawnVehicle: notUsed,
    consumeVehicleItem: notUsed,
    receivedGift: notUsed,
    giveGift: notUsed,
    markGiftReceived: notUsed,
  };
  // cellFor and placesOnWater never touch the repository.
  const placement = new PlaceVehicle(placementWorld, {} as VehicleRepository);
  const place = {
    execute: vi.fn(),
    cellFor: placement.cellFor.bind(placement),
    placesOnWater: placement.placesOnWater.bind(placement),
  };
  const headlights = { execute: vi.fn() };
  const ceilingLights = { execute: vi.fn() };
  const usesBefore = game.use.mock.calls.length;
  registerSubscriptions(
    { place, headlights, ceilingLights } as unknown as Parameters<
      typeof registerSubscriptions
    >[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  // Placement subscribes to block interactions last.
  const before = game.before.mock.calls.at(-1)?.[0];
  const uses = game.use.mock.calls
    .slice(usesBefore)
    .map(([handler]) => handler);
  if (!before || uses.length !== 3) throw new Error("subscriptions missing");
  game.run.mockClear();
  const event = {
    isFirstEvent: true,
    itemStack: { typeId },
    blockFace: "Up",
    cancel: false,
    block,
    player,
  };
  return {
    event,
    player,
    place,
    headlights,
    ceilingLights,
    uses,
    waterDimensions,
    dimension,
    interact: () =>
      before(event as unknown as PlayerInteractWithBlockBeforeEvent),
    use: () => {
      const ev = {
        itemStack: { typeId },
        source: player,
      } as unknown as ItemUseAfterEvent;
      for (const handler of uses) handler(ev);
    },
    // system.run callbacks run on the next tick.
    nextTick: () => {
      game.currentTick++;
      for (const [callback] of game.run.mock.calls) callback();
      game.run.mockClear();
    },
  };
}

const boatAt = (blockLocation: At) => ({
  kind: "sportsboat",
  playerId: "player",
  dimensionId: "overworld",
  blockLocation,
  yaw: -90,
  slot: 2,
});

beforeEach(() => {
  vi.clearAllMocks();
  game.currentTick = 10;
});

it("places the boat at the water surface on the next tick from the bed's top face, and not from a dry side or bottom face", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...FACES),
      fc.integer({ min: 0, max: 16 }),
      (face, depth) => {
        const f = fixture(ITEM_TYPE.sportsboat, depth);
        f.event.blockFace = face;
        f.interact();
        expect(new Set(f.waterDimensions)).toEqual(new Set(["overworld"]));
        expect(f.event.cancel).toBe(face === "Up");
        expect(f.place.execute).not.toHaveBeenCalled();
        f.nextTick();
        if (face === "Up")
          expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
            boatAt({ x: 2, y: 5 + depth, z: 3 }),
          );
        else expect(f.place.execute).not.toHaveBeenCalled();
      },
    ),
  );
});

it("places the boat on the water beside a shore whose side is clicked", () => {
  // Water fills x 3 from y 4 to y 6, beside the clicked block's east face.
  const f = fixture(
    ITEM_TYPE.sportsboat,
    0,
    (at) => at.x === 3 && at.y >= 4 && at.y <= 6,
  );
  f.event.blockFace = "East";
  f.interact();
  expect(f.event.cancel).toBe(true);
  f.nextTick();
  expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
    boatAt({ x: 3, y: 6, z: 3 }),
  );
});

it("keeps SUV placement restricted to first events on the top face without climbing", () => {
  fc.assert(
    fc.property(fc.constantFrom(...FACES), fc.boolean(), (face, first) => {
      const f = fixture(ITEM_TYPE.suv);
      f.event.blockFace = face;
      f.event.isFirstEvent = first;
      f.interact();
      f.use();
      f.nextTick();
      expect(f.event.cancel).toBe(first && face === "Up");
      expect(f.place.execute).toHaveBeenCalledTimes(
        first && face === "Up" ? 1 : 0,
      );
      if (first && face === "Up")
        expect(f.place.execute.mock.calls[0]?.[0].blockLocation).toEqual({
          x: 2,
          y: 5,
          z: 3,
        });
      expect(f.player.getBlockFromViewDirection).not.toHaveBeenCalled();
    }),
  );
});

it("places one boat when one tap fires both the interaction and itemUse in the same tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (interactFirst) => {
      const f = fixture();
      if (interactFirst) {
        f.interact();
        f.use();
      } else {
        f.use();
        f.interact();
      }
      f.use();
      f.nextTick();
      expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
        boatAt({ x: 2, y: 8, z: 3 }),
      );
      expect(f.player.getBlockFromViewDirection).toHaveBeenCalledWith({
        includeLiquidBlocks: true,
        includePassableBlocks: true,
        maxDistance: 12,
      });
      f.player.id = "other";
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(2);
      f.nextTick();
      f.use();
      expect(f.place.execute).toHaveBeenCalledTimes(3);
    }),
  );
});

it("ignores a repeated boat interaction", () => {
  const f = fixture();
  f.event.isFirstEvent = false;
  f.interact();
  f.nextTick();
  expect(f.event.cancel).toBe(false);
  expect(f.place.execute).not.toHaveBeenCalled();
});

it("places nothing from an itemUse ray that misses or hits land, and leaves that tick's request to the interaction", () => {
  fc.assert(
    fc.property(fc.boolean(), (miss) => {
      const f = fixture();
      f.player.getBlockFromViewDirection.mockReturnValue(
        miss
          ? undefined
          : {
              block: { ...f.event.block, location: { x: 2, y: 2, z: 3 } },
              face: "Up",
            },
      );
      f.use();
      expect(f.place.execute).not.toHaveBeenCalled();
      f.interact();
      f.nextTick();
      expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
        boatAt({ x: 2, y: 8, z: 3 }),
      );
    }),
  );
});

it("limits deferred placement and itemUse to one placement on their execution tick", () => {
  fc.assert(
    fc.property(fc.boolean(), (flushFirst) => {
      const f = fixture();
      f.interact();
      if (flushFirst) {
        f.nextTick();
        f.use();
      } else {
        game.currentTick++;
        f.use();
        game.currentTick--;
        f.nextTick();
      }
      expect(f.place.execute).toHaveBeenCalledTimes(1);
    }),
  );
});

it("routes itemUse to placement or headlights by item, in either subscriber order", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        ITEM_TYPE.suv,
        ITEM_TYPE.sportsboat,
        ITEM_TYPE.camper,
        HEADLIGHT_SWITCH_TYPE,
        "minecraft:stick",
      ),
      fc.boolean(),
      (typeId, reversed) => {
        const f = fixture(typeId);
        const ev = {
          itemStack: { typeId },
          source: f.player,
        } as unknown as ItemUseAfterEvent;
        for (const handler of reversed ? [...f.uses].reverse() : f.uses)
          handler(ev);
        if (typeId === HEADLIGHT_SWITCH_TYPE)
          expect(f.headlights.execute).toHaveBeenCalledExactlyOnceWith({
            playerId: "player",
            vehicleId: "vehicle",
          });
        else expect(f.headlights.execute).not.toHaveBeenCalled();
        if (typeId === ITEM_TYPE.sportsboat)
          expect(f.place.execute).toHaveBeenCalledExactlyOnceWith(
            boatAt({ x: 2, y: 8, z: 3 }),
          );
        else expect(f.place.execute).not.toHaveBeenCalled();
        expect(f.player.getBlockFromViewDirection).toHaveBeenCalledTimes(
          typeId === ITEM_TYPE.sportsboat ? 1 : 0,
        );
      },
    ),
  );
});

it("leaves the headlights alone when the switch is used without riding a vehicle", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(undefined, { id: "pig", typeId: "minecraft:pig" }),
      (mount) => {
        const f = fixture(HEADLIGHT_SWITCH_TYPE);
        f.player.getComponent = (name: string) =>
          name === "minecraft:riding" && mount
            ? { entityRidingOn: mount }
            : undefined;
        f.use();
        expect(f.headlights.execute).not.toHaveBeenCalled();
      },
    ),
  );
});

it("paints a hit vehicle with a held dye and otherwise damages it, ignoring other hits", () => {
  const hit = { execute: vi.fn() };
  const paint = { execute: vi.fn() };
  registerSubscriptions(
    { hit, paint } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const onHit = vi
    .mocked(world.afterEvents.entityHitEntity.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!onHit) throw new Error("entityHitEntity not subscribed");
  const [dye, dyePaint] = defined(
    Object.entries(PAINT_BY_DYE)[0],
    "a dye paint",
  );
  let held: string | undefined = dye;
  const player = Object.assign(Object.create(Player.prototype) as object, {
    id: "player",
    selectedSlotIndex: 0,
    location: { x: 0.5, y: 64, z: 0.5 },
    dimension: { getBlock: () => ({ typeId: "minecraft:stone" }) },
    getComponent: () => ({
      container: { getItem: () => (held ? { typeId: held } : undefined) },
    }),
  });
  const vehicle = { id: "vehicle", typeId: ENTITY_TYPE.suv };
  const send = (damagingEntity: unknown, hitEntity = vehicle) =>
    onHit({
      damagingEntity,
      hitEntity,
    } as unknown as EntityHitEntityAfterEvent);
  send(player, { id: "cow", typeId: "minecraft:cow" });
  send({ id: "zombie" });
  expect(paint.execute).not.toHaveBeenCalled();
  expect(hit.execute).not.toHaveBeenCalled();
  send(player);
  expect(paint.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    vehicleId: "vehicle",
    paint: dyePaint,
  });
  expect(hit.execute).not.toHaveBeenCalled();
  held = undefined;
  send(player);
  expect(hit.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    vehicleId: "vehicle",
    fromDeck: false,
  });
  expect(paint.execute).toHaveBeenCalledOnce();
});

it("switches the headlights of the ridden vehicle when its rider interacts with it holding the switch", () => {
  const f = fixture(HEADLIGHT_SWITCH_TYPE);
  const interact = vi
    .mocked(world.beforeEvents.playerInteractWithEntity.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!interact) throw new Error("playerInteractWithEntity not subscribed");
  const send = (
    typeId: string | undefined,
    target: { id: string; typeId: string },
  ) => {
    const ev = {
      player: f.player,
      target,
      itemStack: typeId ? { typeId } : undefined,
      cancel: false,
    };
    interact(ev as unknown as PlayerInteractWithEntityBeforeEvent);
    return ev.cancel;
  };
  const ridden = { id: "vehicle", typeId: ENTITY_TYPE.suv };
  expect(
    send(HEADLIGHT_SWITCH_TYPE, { id: "cow", typeId: "minecraft:cow" }),
  ).toBe(false);
  expect(
    send(HEADLIGHT_SWITCH_TYPE, { id: "other", typeId: ENTITY_TYPE.suv }),
  ).toBe(false);
  expect(send(undefined, ridden)).toBe(false);
  expect(send("minecraft:stick", ridden)).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
  expect(send(HEADLIGHT_SWITCH_TYPE, ridden)).toBe(true);
  expect(f.headlights.execute).not.toHaveBeenCalled();
  f.nextTick();
  expect(f.headlights.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    vehicleId: "vehicle",
  });
});

// A player at (2.5, 65, 3.5) whose feet stand on the floor cell (2, 64, 3) of the camper "room"
// unless `owner` says otherwise, holding the switch (ADR 0115).
function lightSwitchFixture(
  mount?: { id: string; typeId: string },
  owner = (cell: At) =>
    cell.x === 2 && cell.y === 64 && cell.z === 3
      ? asVehicleId("room")
      : undefined,
  inputMode = "KeyboardAndMouse",
  laterSwitchTargets: () => readonly SwitchTarget[] = () => [],
) {
  const headlights = { execute: vi.fn(() => false) };
  const ceilingLights = {
    execute: vi.fn(() => true),
    canSwitch: vi.fn(() => true),
  };
  // The boat leaves boarding to the engine here, so only the switch acts (ADR 0120).
  const board = { execute: vi.fn(() => false) };
  const usesBefore = game.use.mock.calls.length;
  const entityPresses = vi.mocked(
    world.beforeEvents.playerInteractWithEntity.subscribe,
  );
  const entityPressesBefore = entityPresses.mock.calls.length;
  registerSubscriptions(
    { headlights, ceilingLights, board } as unknown as Parameters<
      typeof registerSubscriptions
    >[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    (_, cell) => owner(cell),
    () => undefined,
    laterSwitchTargets,
  );
  // Decor, gifts, the switch, then placement subscribe to block presses.
  const onBlock = defined(game.before.mock.calls.at(-2)?.[0], "block press");
  // The stand-ins, then the switch subscribe to entity presses (ADR 0115, 0116).
  const onEntity = entityPresses.mock.calls
    .slice(entityPressesBefore)
    .map(([h]) => h);
  const uses = game.use.mock.calls.slice(usesBefore).map(([h]) => h);
  game.run.mockClear();
  const player = {
    id: "player",
    isValid: true,
    dimension: { id: "overworld" },
    location: { x: 2.5, y: 65, z: 3.5 },
    getHeadLocation: () => ({ x: 2.5, y: 66.62, z: 3.5 }),
    getViewDirection: () => ({ x: 0, y: -1, z: 0 }),
    inputInfo: { lastInputModeUsed: inputMode },
    getComponent: (name: string) =>
      name === "minecraft:riding" && mount
        ? { entityRidingOn: mount }
        : undefined,
  };
  const itemStack = { typeId: HEADLIGHT_SWITCH_TYPE };
  return {
    headlights,
    ceilingLights,
    board,
    use: () => {
      for (const h of uses)
        h({ itemStack, source: player } as unknown as ItemUseAfterEvent);
    },
    pressBlock: (isFirstEvent = true, typeId = HEADLIGHT_SWITCH_TYPE) => {
      const ev = { player, itemStack: { typeId }, isFirstEvent, cancel: false };
      onBlock(ev as unknown as PlayerInteractWithBlockBeforeEvent);
      return ev.cancel;
    },
    pressEntity: (target: { id: string; typeId: string }) => {
      const ev = {
        player,
        target: { location: { x: 2.5, y: 64, z: 3.5 }, ...target },
        itemStack,
        cancel: false,
      };
      for (const h of onEntity)
        h(ev as unknown as PlayerInteractWithEntityBeforeEvent);
      return ev.cancel;
    },
    nextTick: () => {
      for (const [callback] of game.run.mock.calls) callback();
      game.run.mockClear();
    },
  };
}

it("asks the later switch targets after the vehicle's, on every use", () => {
  const later = {
    claimsItemUse: vi.fn(() => true),
    claimsBlockPress: vi.fn(() => true),
    claimsEntityPress: vi.fn(() => false),
    switchFor: vi.fn(),
  } satisfies SwitchTarget;
  const laterSwitchTargets = vi.fn(() => [later]);
  // On foot outside every camper room, the vehicle target refuses.
  const outside = lightSwitchFixture(
    undefined,
    () => undefined,
    "KeyboardAndMouse",
    laterSwitchTargets,
  );
  expect(laterSwitchTargets).not.toHaveBeenCalled();
  outside.use();
  expect(later.switchFor).toHaveBeenCalledTimes(1);
  expect(outside.ceilingLights.execute).not.toHaveBeenCalled();
  // In a camper room, the vehicle target claims first.
  later.switchFor.mockClear();
  const room = lightSwitchFixture(
    undefined,
    undefined,
    "KeyboardAndMouse",
    () => [later],
  );
  room.use();
  expect(room.ceilingLights.execute).toHaveBeenCalledTimes(1);
  expect(later.switchFor).not.toHaveBeenCalled();
});

it("preserves switch routing, cancellation and use-case arguments across rider and room states", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("none", "room", "vehicle"),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (mountId, owner, canSwitch, headlightsSwitch, isFirstEvent) => {
        const mount =
          mountId === "none"
            ? undefined
            : {
                id: mountId,
                typeId:
                  mountId === "room" ? ENTITY_TYPE.camper : ENTITY_TYPE.suv,
              };
        const f = lightSwitchFixture(mount, () =>
          owner ? asVehicleId("room") : undefined,
        );
        f.ceilingLights.canSwitch.mockReturnValue(canSwitch);
        f.headlights.execute.mockReturnValue(headlightsSwitch);
        const headlightCalls: unknown[][] = [];
        const ceilingCalls: unknown[][] = [];
        // Transcribe the existing use rule: the mount gets headlights first, then ceiling
        // lights on refusal; on foot only the room gets ceiling lights (ADR 0115).
        const use = () => {
          if (mount) {
            headlightCalls.push([{ playerId: "player", vehicleId: mount.id }]);
            if (!headlightsSwitch)
              ceilingCalls.push([{ ...inRoom, vehicleId: mount.id }]);
          } else if (owner) ceilingCalls.push([inRoom]);
        };
        const check = () => {
          expect(f.headlights.execute.mock.calls).toEqual(headlightCalls);
          expect(f.ceilingLights.execute.mock.calls).toEqual(ceilingCalls);
        };
        f.use();
        use();
        check();
        f.nextTick();
        check();

        const blockClaim = !mount && owner && canSwitch;
        expect(f.pressBlock(isFirstEvent)).toBe(blockClaim);
        check();
        f.nextTick();
        if (blockClaim && isFirstEvent) use();
        check();

        for (const id of ["room", "other"]) {
          const entityClaim =
            mount?.id === id || (owner && id === "room" && canSwitch);
          expect(f.pressEntity({ id, typeId: ENTITY_TYPE.camper })).toBe(
            entityClaim,
          );
          check();
          f.nextTick();
          if (entityClaim) use();
          check();
        }
      },
    ),
  );
});

it("aims a boarding press along the view on mouse, and from where a touch player stands (ADR 0120)", () => {
  const boat = { id: "boat", typeId: ENTITY_TYPE.sportsboat };
  for (const [mode, view] of [
    ["KeyboardAndMouse", { x: 0, y: -1, z: 0 }],
    ["Touch", undefined],
  ] as const) {
    const f = lightSwitchFixture(undefined, () => undefined, mode);
    f.pressEntity(boat);
    expect(f.board.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "player",
      vehicleId: "boat",
      eye: { x: 0, y: expect.closeTo(2.62, 9), z: 0 },
      view,
    });
  }
});

const inRoom = {
  playerId: "player",
  vehicleId: "room",
  feet: { x: 2.5, y: 65, z: 3.5 },
};

it("switches the ceiling lights of the room a player on foot stands in, and nothing outside a room (ADR 0115)", () => {
  const f = lightSwitchFixture();
  f.use();
  expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith(inRoom);
  expect(f.headlights.execute).not.toHaveBeenCalled();
  const outside = lightSwitchFixture(undefined, () => undefined);
  outside.use();
  expect(outside.ceilingLights.execute).not.toHaveBeenCalled();
});

it("finds the room from the cell of the feet when the cell under them is not laid (ADR 0115)", () => {
  const f = lightSwitchFixture(undefined, (cell) =>
    cell.y === 65 ? asVehicleId("room") : undefined,
  );
  f.use();
  expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith(inRoom);
});

it("gives a rider's switch to the headlights first, and to the ceiling lights only when the rider is not the driver (ADR 0020, 0115)", () => {
  const camper = { id: "camper", typeId: ENTITY_TYPE.camper };
  const f = lightSwitchFixture(camper);
  f.headlights.execute.mockReturnValueOnce(true);
  f.use();
  expect(f.headlights.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    vehicleId: "camper",
  });
  expect(f.ceilingLights.execute).not.toHaveBeenCalled();
  f.use();
  expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith({
    ...inRoom,
    vehicleId: "camper",
  });
});

it("takes a switch press on a block in a room on the next tick, cancelled, and leaves riders and other items alone (ADR 0115)", () => {
  const f = lightSwitchFixture();
  expect(f.pressBlock(true, "minecraft:stick")).toBe(false);
  expect(f.pressBlock(false)).toBe(true);
  expect(game.run).not.toHaveBeenCalled();
  expect(f.pressBlock()).toBe(true);
  expect(f.ceilingLights.execute).not.toHaveBeenCalled();
  f.nextTick();
  expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith(inRoom);
  const rider = lightSwitchFixture({
    id: "camper",
    typeId: ENTITY_TYPE.camper,
  });
  expect(rider.pressBlock()).toBe(false);
  const outside = lightSwitchFixture(undefined, () => undefined);
  expect(outside.pressBlock()).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
});

it("takes a switch press on the camper whose room the player stands in, and not on another vehicle (ADR 0115)", () => {
  const f = lightSwitchFixture();
  expect(f.pressEntity({ id: "other", typeId: ENTITY_TYPE.camper })).toBe(
    false,
  );
  expect(f.pressEntity({ id: "room", typeId: ENTITY_TYPE.camper })).toBe(true);
  f.nextTick();
  expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith(inRoom);
});

it("leaves block and vehicle presses alone on a dock cell from which the switch cannot reach ceiling lights, such as a boat deck or the camper roof (ADR 0115)", () => {
  const f = lightSwitchFixture();
  f.ceilingLights.canSwitch.mockReturnValue(false);
  expect(f.pressBlock()).toBe(false);
  expect(f.pressEntity({ id: "room", typeId: ENTITY_TYPE.sportsboat })).toBe(
    false,
  );
  expect(f.ceilingLights.canSwitch).toHaveBeenCalledWith(inRoom);
  expect(game.run).not.toHaveBeenCalled();
});

it("removes an orphan deck seat that loads with a chunk, but not one that is just spawned", () => {
  const limit = { start: vi.fn(), found: vi.fn(), spawned: vi.fn() };
  registerSubscriptions(
    { limit } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const spawn = vi
    .mocked(world.afterEvents.entitySpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn) throw new Error("entitySpawn not subscribed");
  const seat = () => ({
    typeId: DECK_SEAT_TYPE,
    isValid: true,
    location: { x: 0, y: 0, z: 0 },
    dimension: { getEntities: () => [] },
    getDynamicProperty: (key: string) =>
      key === DECK_SEAT_OF_PROPERTY ? "gone" : undefined,
    remove: vi.fn(),
  });
  const loaded = seat();
  const spawned = seat();
  spawn({
    entity: loaded,
    cause: "Loaded",
  } as unknown as EntitySpawnAfterEvent);
  spawn({
    entity: spawned,
    cause: "Spawned",
  } as unknown as EntitySpawnAfterEvent);
  expect(loaded.remove).toHaveBeenCalledOnce();
  expect(spawned.remove).not.toHaveBeenCalled();
  expect(limit.found).not.toHaveBeenCalled();
  expect(limit.spawned).not.toHaveBeenCalled();
});

it("passes fleet metadata on spawn and load and skips invalid or unrelated entities", () => {
  const limit = { start: vi.fn(), found: vi.fn(), spawned: vi.fn() };
  registerSubscriptions(
    { limit } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const spawn = vi
    .mocked(world.afterEvents.entitySpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  const load = vi
    .mocked(world.afterEvents.entityLoad.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn || !load) throw new Error("fleet events not subscribed");
  const entity = {
    id: "boat",
    typeId: ENTITY_TYPE.sportsboat,
    isValid: true,
    getDynamicProperty: (key: string) =>
      key === OWNER_PROPERTY ? "player" : undefined,
  };
  const entry = { id: "boat", kind: "sportsboat", owner: "player" };
  spawn({ entity, cause: "Spawned" } as unknown as EntitySpawnAfterEvent);
  expect(limit.spawned).toHaveBeenCalledExactlyOnceWith(entry);
  spawn({ entity, cause: "Loaded" } as unknown as EntitySpawnAfterEvent);
  load({ entity } as unknown as EntityLoadAfterEvent);
  expect(limit.found.mock.calls).toEqual([[[entry]], [[entry]]]);
  for (const skipped of [
    { ...entity, isValid: false },
    { ...entity, typeId: "minecraft:cow" },
  ]) {
    spawn({
      entity: skipped,
      cause: "Spawned",
    } as unknown as EntitySpawnAfterEvent);
    load({ entity: skipped } as unknown as EntityLoadAfterEvent);
  }
  expect(limit.spawned).toHaveBeenCalledTimes(1);
  expect(limit.found).toHaveBeenCalledTimes(2);
});

it("forgets a removed vehicle by the chunk at its location, and passes vehicle deaths (ADR 0125)", () => {
  const limit = { start: vi.fn(), removed: vi.fn(), died: vi.fn() };
  registerSubscriptions(
    { limit } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const remove = vi
    .mocked(world.beforeEvents.entityRemove.subscribe)
    .mock.calls.at(-1)?.[0];
  const die = vi
    .mocked(world.afterEvents.entityDie.subscribe)
    .mock.calls.at(-1);
  if (!remove || !die) throw new Error("removal events not subscribed");
  const removing = (id: string, typeId: string, getBlock: () => unknown) =>
    remove({
      removedEntity: {
        id,
        typeId,
        dimension: { getBlock },
        location: { x: 1, y: 2, z: 3 },
      },
    } as unknown as EntityRemoveBeforeEvent);
  game.run.mockClear();
  removing("loaded", ENTITY_TYPE.suv, () => ({}));
  removing("unloaded", ENTITY_TYPE.suv, () => undefined);
  removing("thrown", ENTITY_TYPE.camper, () => {
    throw new Error("LocationInUnloadedChunkError");
  });
  removing("cow", "minecraft:cow", () => ({}));
  expect(limit.removed).not.toHaveBeenCalled();
  for (const [callback] of game.run.mock.calls) callback();
  expect(limit.removed.mock.calls).toEqual([
    ["loaded", true],
    ["unloaded", false],
    ["thrown", false],
  ]);

  const [onDeath, options] = die;
  expect(options?.entityTypes).toEqual(Object.values(ENTITY_TYPE));
  onDeath({ deadEntity: { id: "loaded" } } as unknown as EntityDieAfterEvent);
  expect(limit.died).toHaveBeenCalledExactlyOnceWith("loaded");
});

it("cancels a player's break only of a block a held vehicle laid (ADR 0096)", () => {
  const owner =
    vi.fn<
      (dimensionId: string, cell: At, typeId: string) => VehicleId | undefined
    >();
  registerSubscriptions(
    {} as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    owner,
    () => [],
  );
  const handler = game.breakBlock.mock.calls.at(-1)?.[0];
  if (!handler) throw new Error("playerBreakBlock not subscribed");
  // Registration itself schedules work through system.run; only the guard is checked.
  game.run.mockClear();
  const cell = { x: 1, y: 64, z: 2 };
  const breakAt = () => {
    const event = {
      dimension: { id: "overworld" },
      block: { location: cell, typeId: CAMPER_FLOOR_BLOCK },
      cancel: false,
    };
    handler(event as unknown as PlayerBreakBlockBeforeEvent);
    return event;
  };
  expect(breakAt().cancel).toBe(false);
  expect(owner).toHaveBeenCalledExactlyOnceWith(
    "overworld",
    cell,
    CAMPER_FLOOR_BLOCK,
  );
  owner.mockReturnValue(asVehicleId("camper"));
  expect(breakAt().cancel).toBe(true);
  expect(game.run).not.toHaveBeenCalled();
});

it("registers door interactions during startup and dispatches only owned doors", () => {
  const before = game.startup.mock.calls.length;
  const door = { execute: vi.fn() };
  const owner =
    vi.fn<(dimensionId: string, cell: At) => VehicleId | undefined>();
  registerSubscriptions(
    { door } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    owner,
    () => undefined,
    () => undefined,
    () => [],
  );
  const startups = game.startup.mock.calls.slice(before);
  if (startups.length === 0)
    throw new Error("startup not subscribed synchronously");
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  for (const [startup] of startups)
    startup({
      blockComponentRegistry: { registerCustomComponent },
    } as unknown as StartupEvent);
  const interact = registerCustomComponent.mock.calls.find(
    ([name]) => name === CAMPER_DOOR_COMPONENT,
  )?.[1].onPlayerInteract;
  if (!interact) throw new Error("door interaction missing");
  const cell = { x: 1, y: 64, z: 2 };
  const event = {
    dimension: { id: "overworld" },
    block: { location: cell },
  } as Parameters<typeof interact>[0];
  interact(event, { params: undefined });
  expect(owner).toHaveBeenCalledExactlyOnceWith("overworld", cell);
  expect(door.execute).not.toHaveBeenCalled();
  owner.mockReturnValue(asVehicleId("camper"));
  interact(event, { params: undefined });
  expect(door.execute).toHaveBeenCalledExactlyOnceWith({ vehicleId: "camper" });
});

it("registers bed interactions during startup and passes the player, dimension, and cell (ADR 0092)", () => {
  const before = game.startup.mock.calls.length;
  const bed = { execute: vi.fn() };
  registerSubscriptions(
    { bed } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    vi.fn(),
    () => undefined,
    () => undefined,
    () => [],
  );
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  for (const [startup] of game.startup.mock.calls.slice(before)) {
    startup({
      blockComponentRegistry: { registerCustomComponent },
    } as unknown as StartupEvent);
  }
  const interact = registerCustomComponent.mock.calls.find(
    ([name]) => name === CAMPER_BED_COMPONENT,
  )?.[1].onPlayerInteract;
  if (!interact) throw new Error("bed interaction missing");
  const cell = { x: 1, y: 65, z: 2 };
  interact(
    {
      dimension: { id: "minecraft:overworld" },
      block: { location: cell },
      player: { id: "p" },
    } as Parameters<typeof interact>[0],
    { params: undefined },
  );
  expect(bed.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    dimensionId: "minecraft:overworld",
    cell,
  });
  bed.execute.mockClear();
  interact(
    {
      dimension: { id: "minecraft:overworld" },
      block: { location: cell },
    } as Parameters<typeof interact>[0],
    { params: undefined },
  );
  expect(bed.execute).not.toHaveBeenCalled();
});

it("registers shower-toilet presses during startup and sends an empty hand's press with the player's feet to the camper (ADR 0098, 0118)", () => {
  const before = game.startup.mock.calls.length;
  const showerToilet = { execute: vi.fn() };
  const owner = vi.fn<(dimensionId: string, cell: At) => VehicleId | undefined>(
    () => asVehicleId("camper"),
  );
  registerSubscriptions(
    { showerToilet } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    owner,
    () => undefined,
    () => [],
  );
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  for (const [startup] of game.startup.mock.calls.slice(before))
    startup({
      blockComponentRegistry: { registerCustomComponent },
    } as unknown as StartupEvent);
  const interact = registerCustomComponent.mock.calls.find(
    ([name]) => name === CAMPER_SHOWER_TOILET_COMPONENT,
  )?.[1].onPlayerInteract;
  if (!interact) throw new Error("shower-toilet interaction missing");
  const cell = { x: 4, y: 65, z: -7 };
  fc.assert(
    fc.property(
      fc.double({ min: -3, max: 3, noNaN: true }),
      fc.double({ min: -3, max: 3, noNaN: true }),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (dx, dz, held, owned, hasPlayer) => {
        owner.mockClear();
        showerToilet.execute.mockClear();
        owner.mockReturnValue(owned ? asVehicleId("camper") : undefined);
        const feet = { x: 4.5 + dx, y: 65, z: -6.5 + dz };
        const player = {
          id: "p",
          location: feet,
          selectedSlotIndex: 0,
          getComponent: () => ({
            container: {
              getItem: () => (held ? { typeId: "minecraft:stone" } : undefined),
            },
          }),
        };
        interact(
          {
            dimension: { id: "overworld" },
            block: { location: cell },
            player: hasPlayer ? player : undefined,
          } as unknown as Parameters<typeof interact>[0],
          { params: undefined },
        );
        if (!hasPlayer || held) {
          expect(owner).not.toHaveBeenCalled();
          expect(showerToilet.execute).not.toHaveBeenCalled();
          return;
        }
        expect(owner).toHaveBeenCalledExactlyOnceWith("overworld", cell);
        if (!owned) {
          expect(showerToilet.execute).not.toHaveBeenCalled();
          return;
        }
        expect(showerToilet.execute).toHaveBeenCalledExactlyOnceWith({
          vehicleId: "camper",
          feet,
        });
      },
    ),
    { examples: [[0, 0, false, true, true]] },
  );
});

it("checks the hints every hint interval, after the drive on the same tick (ADR 0086)", () => {
  const drive = { execute: vi.fn() };
  const hints = { execute: vi.fn() };
  registerSubscriptions(
    { drive, hints } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const intervals = vi.mocked(system.runInterval).mock.calls;
  expect(intervals.map(([, ticks]) => ticks)).toEqual([
    1,
    SPEC.hintCheckInterval,
  ]);
  for (const [callback] of intervals) callback();
  expect(drive.execute).toHaveBeenCalledWith(game.currentTick);
  expect(hints.execute).toHaveBeenCalledOnce();
  expect(drive.execute.mock.invocationCallOrder[0]).toBeLessThan(
    defined(hints.execute.mock.invocationCallOrder[0], "hints call"),
  );
});

it("gives the starter vehicle only on a player's initial spawn", () => {
  const starter = { execute: vi.fn() };
  registerSubscriptions(
    { starter } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const spawn = vi
    .mocked(world.afterEvents.playerSpawn.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!spawn) throw new Error("playerSpawn not subscribed");
  const player = { id: "player" };
  spawn({ player, initialSpawn: false } as unknown as PlayerSpawnAfterEvent);
  expect(starter.execute).not.toHaveBeenCalled();
  spawn({ player, initialSpawn: true } as unknown as PlayerSpawnAfterEvent);
  expect(starter.execute).toHaveBeenCalledExactlyOnceWith("player");
});

it("stores and clears test input only from server script events", () => {
  const inputs = new VehicleTestStore<RawInput>();
  registerSubscriptions(
    {} as unknown as Parameters<typeof registerSubscriptions>[0],
    inputs,
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const receive = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!receive) throw new Error("scriptEventReceive not subscribed");
  const send = (
    message: string,
    sourceType = "Server",
    id = TEST_INPUT_EVENT,
  ) =>
    receive({
      id,
      message,
      sourceType,
    } as unknown as ScriptEventCommandMessageAfterEvent);
  send("suv,1,0,1", "Entity");
  send("suv,1,0,1", "Server", "minecraft:other");
  expect(inputs.get(asVehicleId("suv"))).toBeUndefined();
  send("suv,1,-1,1");
  expect(inputs.get(asVehicleId("suv"))).toEqual({
    moveX: 1,
    moveY: -1,
    jump: true,
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  send("suv,bad");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
  expect(inputs.get(asVehicleId("suv"))).toEqual({
    moveX: 1,
    moveY: -1,
    jump: true,
  });
  send("suv,clear");
  expect(inputs.get(asVehicleId("suv"))).toBeUndefined();
});

it("sets the blade only from server test blade script events (ADR 0138)", () => {
  const blade = { force: vi.fn() };
  registerSubscriptions(
    { blade } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const receive = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-3)?.[0];
  if (!receive) throw new Error("scriptEventReceive not subscribed");
  const send = (
    message: string,
    sourceType = "Server",
    id = TEST_BLADE_EVENT,
  ) =>
    receive({
      id,
      message,
      sourceType,
    } as unknown as ScriptEventCommandMessageAfterEvent);
  send("car,raised", "Entity");
  send("car,raised", "Server", "minecraft:other");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  send("car,bad");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
  expect(blade.force).not.toHaveBeenCalled();
  send("car,raised");
  expect(blade.force).toHaveBeenCalledExactlyOnceWith({
    vehicleId: "car",
    raised: true,
  });
  send("car,lowered");
  expect(blade.force).toHaveBeenLastCalledWith({
    vehicleId: "car",
    raised: false,
  });
});

it("sets decor only from server test decor script events (ADR 0093)", () => {
  const decor = { execute: vi.fn() };
  registerSubscriptions(
    { decor } as unknown as Parameters<typeof registerSubscriptions>[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  const receive = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-2)?.[0];
  if (!receive) throw new Error("scriptEventReceive not subscribed");
  const send = (
    message: string,
    sourceType = "Server",
    id = TEST_DECOR_EVENT,
  ) =>
    receive({
      id,
      message,
      sourceType,
    } as unknown as ScriptEventCommandMessageAfterEvent);
  send("car,table,potted_plant", "Entity");
  send("car,table,potted_plant", "Server", "minecraft:other");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  send("car,bad");
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
  expect(decor.execute).not.toHaveBeenCalled();
  send("car,table,potted_plant");
  expect(decor.execute).toHaveBeenCalledExactlyOnceWith({
    vehicleId: "car",
    slot: "table",
    item: "potted_plant",
  });
  send("car,table,clear");
  expect(decor.execute).toHaveBeenLastCalledWith({
    vehicleId: "car",
    slot: "table",
    item: undefined,
  });
});

function decorFixture() {
  const placeDecor = { execute: vi.fn() };
  const removeDecor = { execute: vi.fn() };
  const owner = vi.fn<(dimensionId: string, cell: At) => VehicleId | undefined>(
    () => asVehicleId("car"),
  );
  const before = game.before.mock.calls.length;
  const startupsBefore = game.startup.mock.calls.length;
  registerSubscriptions(
    { placeDecor, removeDecor } as unknown as Parameters<
      typeof registerSubscriptions
    >[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    owner,
    () => undefined,
    () => [],
  );
  // registerDecor subscribes first.
  const handler = defined(game.before.mock.calls[before], "decor handler")[0];
  game.run.mockClear();
  const event = (overrides: Record<string, unknown> = {}) => ({
    isFirstEvent: true,
    cancel: false,
    itemStack: { typeId: "yasu_ride:percolator" },
    block: {
      typeId: CAMPER_FLOOR_BLOCK,
      location: { x: 1, y: 64, z: 2 },
      dimension: { id: "minecraft:overworld" },
      permutation: {
        getAllStates: (): Record<string, number> => ({
          "yasu_ride:height": 12,
        }),
      },
    },
    blockFace: "Up",
    // The engine reports y as 1 minus the real height (ADR 0111).
    faceLocation: { x: 0.25, y: 0.25, z: 0.5 },
    player: {
      id: "p",
      selectedSlotIndex: 4,
      location: { x: 1.5, y: 65, z: 2.5 },
      getHeadLocation: () => ({ x: 1.5, y: 66.62, z: 2.5 }),
    },
    ...overrides,
  });
  const send = (ev: ReturnType<typeof event>) => {
    handler(ev as unknown as PlayerInteractWithBlockBeforeEvent);
    return ev;
  };
  return { placeDecor, removeDecor, owner, startupsBefore, event, send };
}

it("places held camping gear on a camper room, furniture, decor, or pair block on the next tick and cancels every repeat, falling back to another slot, with the player's eye and the corrected height (ADR 0093, 0097, 0104, 0108, 0110, 0111)", () => {
  // Up face: the floor top, the height-12 furniture top, and the decor or pair block's lift
  // plus 1 - y. A side face: 1 - y on every block. The floor and the table's pair block have
  // no height state; the table's pair block is lifted by the table's slot height, 12.
  for (const [typeId, blockFace, y] of [
    [CAMPER_FLOOR_BLOCK, "Up", 65],
    [CAMPER_FURNITURE_BLOCK, "Up", 64.75],
    [decorBlockId("percolator"), "Up", 65.5],
    [pairDecorBlockId("table"), "Up", 65.5],
    [CAMPER_FLOOR_BLOCK, "West", 64.75],
    [CAMPER_FURNITURE_BLOCK, "West", 64.75],
    [decorBlockId("percolator"), "West", 64.75],
    [pairDecorBlockId("table"), "West", 64.75],
  ] as const) {
    const { placeDecor, owner, event, send } = decorFixture();
    const ev = event({ blockFace });
    ev.block = { ...ev.block, typeId };
    if (typeId === CAMPER_FLOOR_BLOCK || typeId === pairDecorBlockId("table"))
      ev.block = { ...ev.block, permutation: { getAllStates: () => ({}) } };
    expect(send(ev).cancel).toBe(true);
    expect(owner).toHaveBeenCalledExactlyOnceWith("minecraft:overworld", {
      x: 1,
      y: 64,
      z: 2,
    });
    expect(placeDecor.execute).not.toHaveBeenCalled();
    for (const [callback] of game.run.mock.calls) callback();
    expect(placeDecor.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "p",
      vehicleId: "car",
      item: "percolator",
      point: { x: 1.25, y, z: 2.5 },
      cell: { x: 1, y: 64, z: 2 },
      hotbarSlot: 4,
      exact: false,
      eye: { x: 1.5, y: 66.62, z: 2.5 },
    });
    game.run.mockClear();
    const repeat = event({ isFirstEvent: false });
    repeat.block = { ...repeat.block, typeId };
    expect(send(repeat).cancel).toBe(true);
    expect(game.run).not.toHaveBeenCalled();
  }
});

it("leaves other items, other blocks, and cells no camper laid alone", () => {
  const cases: ((f: ReturnType<typeof decorFixture>) => {
    cancel: boolean;
  })[] = [
    (f) => f.send(f.event({ itemStack: { typeId: "minecraft:stone" } })),
    (f) => {
      const ev = f.event();
      ev.block = { ...ev.block, typeId: DECK_FLOOR_BLOCK };
      return f.send(ev);
    },
    (f) => {
      const ev = f.event({ itemStack: undefined });
      ev.block = { ...ev.block, typeId: CAMPER_WALL_BLOCK };
      return f.send(ev);
    },
    (f) => {
      f.owner.mockReturnValue(undefined);
      return f.send(f.event());
    },
  ];
  for (const run of cases) {
    const f = decorFixture();
    expect(run(f).cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
  }
});

// The dinette seat stands on the floor layer at y 64; its slot cell is the one above.
// An unloaded chunk has no blocks, so getBlock returns undefined for every cell.
function seatFixture(
  slotBlock: string | null = CAMPER_FURNITURE_BLOCK,
  loaded = true,
) {
  const entitySubscribe = vi.mocked(
    world.beforeEvents.playerInteractWithEntity.subscribe,
  );
  const before = entitySubscribe.mock.calls.length;
  const f = decorFixture();
  // registerDecor subscribes first.
  const handler = defined(
    entitySubscribe.mock.calls[before],
    "decor seat handler",
  )[0];
  const slot = { x: 1, y: 65, z: 2 };
  const getBlock = vi.fn((at: At) =>
    loaded
      ? {
          typeId:
            at.x === slot.x && at.y === slot.y && at.z === slot.z && slotBlock
              ? slotBlock
              : "minecraft:air",
        }
      : undefined,
  );
  const seatEvent = (overrides: Record<string, unknown> = {}) => ({
    cancel: false,
    itemStack: { typeId: "yasu_ride:cushion" },
    target: {
      typeId: DECK_SEAT_TYPE,
      location: { x: 1.5, y: 64.68, z: 2.5 },
      dimension: { id: "minecraft:overworld", getBlock },
    },
    player: { id: "p", selectedSlotIndex: 3 },
    ...overrides,
  });
  const sendSeat = (ev: ReturnType<typeof seatEvent>) => {
    handler(ev as unknown as PlayerInteractWithEntityBeforeEvent);
    return ev;
  };
  return { ...f, slot, seatEvent, sendSeat };
}

it("places held camping gear on the dinette slot under a pressed deck seat instead of seating the player, once per long-press, as an exact press (ADR 0024, 0097, 0104)", () => {
  for (const slotBlock of [CAMPER_FURNITURE_BLOCK, decorBlockId("cushion")]) {
    const { placeDecor, owner, slot, seatEvent, sendSeat } =
      seatFixture(slotBlock);
    expect(sendSeat(seatEvent()).cancel).toBe(true);
    expect(owner).toHaveBeenCalledExactlyOnceWith("minecraft:overworld", slot);
    expect(placeDecor.execute).not.toHaveBeenCalled();
    for (const [callback] of game.run.mock.calls) callback();
    expect(placeDecor.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "p",
      vehicleId: "car",
      item: "cushion",
      point: { x: 1.5, y: 64.68, z: 2.5 },
      cell: slot,
      hotbarSlot: 3,
      exact: true,
    });
    game.run.mockClear();
    expect(sendSeat(seatEvent()).cancel).toBe(true);
    // A held touch repeats every 4 to 6 ticks; each repeat restarts the idle time.
    for (const gap of [1, 5, 9]) {
      game.currentTick += gap;
      expect(sendSeat(seatEvent()).cancel).toBe(true);
    }
    expect(game.run).not.toHaveBeenCalled();
    game.currentTick += 10;
    expect(sendSeat(seatEvent()).cancel).toBe(true);
    expect(game.run).toHaveBeenCalledOnce();
  }
});

it("lets a player sit on a deck seat with an empty hand, other items, no slot under it, an unloaded column, or no camper (ADR 0097)", () => {
  const cases: ((f: ReturnType<typeof seatFixture>) => { cancel: boolean })[] =
    [
      (f) => f.sendSeat(f.seatEvent({ itemStack: undefined })),
      (f) =>
        f.sendSeat(f.seatEvent({ itemStack: { typeId: "minecraft:stone" } })),
      (f) =>
        f.sendSeat(
          f.seatEvent({ itemStack: { typeId: HEADLIGHT_SWITCH_TYPE } }),
        ),
      (f) => {
        const ev = f.seatEvent();
        ev.target = { ...ev.target, typeId: "minecraft:cow" };
        return f.sendSeat(ev);
      },
      (f) => {
        f.owner.mockReturnValue(undefined);
        return f.sendSeat(f.seatEvent());
      },
    ];
  for (const run of cases) {
    const f = seatFixture();
    expect(run(f).cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
  }
  for (const f of [
    seatFixture(null),
    seatFixture(CAMPER_FLOOR_BLOCK),
    seatFixture(CAMPER_FURNITURE_BLOCK, false),
  ]) {
    expect(f.sendSeat(f.seatEvent()).cancel).toBe(false);
    expect(f.owner).not.toHaveBeenCalled();
    expect(game.run).not.toHaveBeenCalled();
  }
});

it("leaves empty-hand presses on room blocks alone (ADR 0098)", () => {
  for (const typeId of [CAMPER_FLOOR_BLOCK, CAMPER_SHOWER_TOILET_BLOCK]) {
    const { placeDecor, event, send } = decorFixture();
    const ev = event({ itemStack: undefined });
    ev.block = { ...ev.block, typeId };
    expect(send(ev).cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
    expect(placeDecor.execute).not.toHaveBeenCalled();
  }
});

it("places held camping gear pressed on the shower-toilet block like on any room block (ADR 0098)", () => {
  const { placeDecor, event, send } = decorFixture();
  const ev = event();
  ev.block = { ...ev.block, typeId: CAMPER_SHOWER_TOILET_BLOCK };
  expect(send(ev).cancel).toBe(true);
  expect(placeDecor.execute).not.toHaveBeenCalled();
  for (const [callback] of game.run.mock.calls) callback();
  expect(placeDecor.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    vehicleId: "car",
    item: "percolator",
    point: { x: 1.25, y: 65, z: 2.5 },
    cell: { x: 1, y: 64, z: 2 },
    hotbarSlot: 4,
    exact: false,
    eye: { x: 1.5, y: 66.62, z: 2.5 },
  });
});

it("takes decor back on an empty-hand interaction with a decor block (ADR 0093)", () => {
  const { removeDecor, owner, startupsBefore } = decorFixture();
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  for (const [startup] of game.startup.mock.calls.slice(startupsBefore))
    startup({
      blockComponentRegistry: { registerCustomComponent },
    } as unknown as StartupEvent);
  const interact = registerCustomComponent.mock.calls.find(
    ([name]) => name === CAMPER_DECOR_COMPONENT,
  )?.[1].onPlayerInteract;
  if (!interact) throw new Error("decor interaction missing");
  const cell = { x: 1, y: 65, z: 2 };
  const eye = { x: 0.4, y: 66.6, z: 2.2 };
  const event = (
    held?: { typeId: string },
    withPlayer = true,
    withFace = true,
  ) =>
    ({
      dimension: { id: "minecraft:overworld" },
      block: { location: cell },
      faceLocation: withFace ? { x: 0.25, y: 0.5, z: 0.75 } : undefined,
      player: withPlayer
        ? {
            id: "p",
            selectedSlotIndex: 0,
            getComponent: () => ({ container: { getItem: () => held } }),
            getHeadLocation: () => eye,
          }
        : undefined,
    }) as unknown as Parameters<typeof interact>[0];
  // The pressed x and z tell the two items of a pair block apart; the eye is not sent,
  // since this event's faceLocation.y is unmeasured (ADR 0108, 0111).
  interact(event(), { params: undefined });
  expect(removeDecor.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    vehicleId: "car",
    cell,
    point: { x: 1.25, y: 65.5, z: 2.75 },
  });
  removeDecor.execute.mockClear();
  interact(event(undefined, true, false), { params: undefined });
  expect(removeDecor.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    vehicleId: "car",
    cell,
    point: undefined,
  });
  removeDecor.execute.mockClear();
  interact(event({ typeId: "minecraft:stone" }), { params: undefined });
  interact(event(undefined, false), { params: undefined });
  owner.mockReturnValue(undefined);
  interact(event(), { params: undefined });
  expect(removeDecor.execute).not.toHaveBeenCalled();
});

it("sends an empty-hand press on the wall cabinet, with the pressed point, to the storage use case, and ignores a held item, no player, or no owner (ADR 0114)", () => {
  const before = game.startup.mock.calls.length;
  const cabinet = { execute: vi.fn() };
  const owner = vi.fn<(dimensionId: string, cell: At) => VehicleId | undefined>(
    () => asVehicleId("car"),
  );
  registerSubscriptions(
    { storage: cabinet } as unknown as Parameters<
      typeof registerSubscriptions
    >[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    owner,
    () => undefined,
    () => [],
  );
  const registerCustomComponent =
    vi.fn<(name: string, component: BlockCustomComponent) => void>();
  for (const [startup] of game.startup.mock.calls.slice(before))
    startup({
      blockComponentRegistry: { registerCustomComponent },
    } as unknown as StartupEvent);
  const interact = registerCustomComponent.mock.calls.find(
    ([name]) => name === CAMPER_CABINET_COMPONENT,
  )?.[1].onPlayerInteract;
  if (!interact) throw new Error("cabinet interaction missing");
  const cell = { x: 3, y: 67, z: -4 };
  const event = (
    held?: { typeId: string },
    withPlayer = true,
    withFace = true,
  ) =>
    ({
      dimension: { id: "minecraft:overworld" },
      block: { location: cell },
      faceLocation: withFace ? { x: 0.5, y: 0.25, z: 0.125 } : undefined,
      player: withPlayer
        ? {
            id: "p",
            selectedSlotIndex: 0,
            getComponent: () => ({ container: { getItem: () => held } }),
          }
        : undefined,
    }) as unknown as Parameters<typeof interact>[0];
  interact(event(), { params: undefined });
  expect(owner).toHaveBeenCalledExactlyOnceWith("minecraft:overworld", cell);
  expect(cabinet.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    vehicleId: "car",
    cell,
    point: { x: 3.5, y: 67.25, z: -3.875 },
  });
  cabinet.execute.mockClear();
  interact(event(undefined, true, false), { params: undefined });
  expect(cabinet.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "p",
    vehicleId: "car",
    cell,
    point: undefined,
  });
  cabinet.execute.mockClear();
  interact(event({ typeId: "minecraft:stone" }), { params: undefined });
  interact(event(undefined, false), { params: undefined });
  owner.mockReturnValue(undefined);
  interact(event(), { params: undefined });
  expect(cabinet.execute).not.toHaveBeenCalled();
});

function registerGiftFixture() {
  const gift = { execute: vi.fn() };
  const headlights = { execute: vi.fn() };
  registerSubscriptions(
    { gift, headlights } as unknown as Parameters<
      typeof registerSubscriptions
    >[0],
    new VehicleTestStore<RawInput>(),
    () => undefined,
    () => undefined,
    () => undefined,
    () => [],
  );
  return gift;
}

it("opens a gift box used in the air from the selected slot (ADR 0093)", () => {
  const usesBefore = game.use.mock.calls.length;
  const gift = registerGiftFixture();
  const uses = game.use.mock.calls
    .slice(usesBefore)
    .map(([handler]) => handler);
  fc.assert(
    fc.property(
      fc.constantFrom(
        GIFT_ITEM.camping_gear_box,
        HEADLIGHT_SWITCH_TYPE,
        "minecraft:stick",
      ),
      (typeId) => {
        gift.execute.mockClear();
        for (const use of uses)
          use({
            itemStack: { typeId },
            source: {
              id: "player",
              selectedSlotIndex: 5,
              getComponent: () => undefined,
            },
          } as unknown as ItemUseAfterEvent);
        if (typeId === GIFT_ITEM.camping_gear_box)
          expect(gift.execute).toHaveBeenCalledExactlyOnceWith({
            playerId: "player",
            gift: "camping_gear_box",
            slot: 5,
          });
        else expect(gift.execute).not.toHaveBeenCalled();
      },
    ),
  );
});

it("opens a gift box used on a block on the next tick and cancels the interaction (ADR 0093)", () => {
  const beforeCount = game.before.mock.calls.length;
  const gift = registerGiftFixture();
  game.run.mockClear();
  const handlers = game.before.mock.calls
    .slice(beforeCount)
    .map(([handler]) => handler);
  const interact = (typeId: string, isFirstEvent: boolean) => {
    const ev = {
      isFirstEvent,
      itemStack: { typeId },
      blockFace: "Up",
      cancel: false,
      block: {
        typeId: "minecraft:grass_block",
        dimension: { id: "overworld" },
        location: { x: 0, y: 64, z: 0 },
      },
      faceLocation: { x: 0.5, y: 1, z: 0.5 },
      player: { id: "player", selectedSlotIndex: 5 },
    };
    for (const handler of handlers)
      handler(ev as unknown as PlayerInteractWithBlockBeforeEvent);
    return ev;
  };
  expect(interact(GIFT_ITEM.camping_gear_box, true).cancel).toBe(true);
  expect(game.run).toHaveBeenCalledTimes(1);
  expect(gift.execute).not.toHaveBeenCalled();
  for (const [callback] of game.run.mock.calls) callback();
  expect(gift.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    gift: "camping_gear_box",
    slot: 5,
  });
  for (const [typeId, isFirstEvent] of [
    [GIFT_ITEM.camping_gear_box, false],
    ["minecraft:stick", true],
  ] as const) {
    game.run.mockClear();
    gift.execute.mockClear();
    expect(interact(typeId, isFirstEvent).cancel).toBe(false);
    expect(game.run).not.toHaveBeenCalled();
    expect(gift.execute).not.toHaveBeenCalled();
  }
});

describe("camper bumper stand-in (ADR 0116)", () => {
  const BUMPER = standInType("camper_bumper", "z");

  function vehicleAndStandIn(owner = "camper") {
    const rideable = { addRider: vi.fn(() => true) };
    const camper = {
      id: "camper",
      typeId: ENTITY_TYPE.camper,
      isValid: true,
      getComponent: (name: string) =>
        name === "minecraft:rideable" ? rideable : undefined,
    };
    const standIn = {
      id: "bumper",
      typeId: BUMPER,
      isValid: true,
      getDynamicProperty: (key: string) =>
        key === STAND_IN_OF_PROPERTY ? owner : undefined,
    };
    game.getEntity.mockImplementation((id: string) =>
      id === camper.id ? camper : undefined,
    );
    return { camper, standIn, rideable };
  }

  function subscribe(useCases: object) {
    registerSubscriptions(
      useCases as Parameters<typeof registerSubscriptions>[0],
      new VehicleTestStore<RawInput>(),
      () => undefined,
      () => undefined,
      () => undefined,
      () => [],
    );
  }

  it("passes a hit or a dye on the stand-in to its camper, and drops one whose camper is gone", () => {
    const hit = { execute: vi.fn() };
    const paint = { execute: vi.fn() };
    subscribe({ hit, paint });
    const onHit = defined(
      vi
        .mocked(world.afterEvents.entityHitEntity.subscribe)
        .mock.calls.at(-1)?.[0],
      "entityHitEntity handler",
    );
    let held: string | undefined;
    const player = Object.assign(Object.create(Player.prototype) as object, {
      id: "player",
      selectedSlotIndex: 0,
      location: { x: 0.5, y: 64, z: 0.5 },
      dimension: { getBlock: () => ({ typeId: "minecraft:stone" }) },
      getComponent: () => ({
        container: { getItem: () => (held ? { typeId: held } : undefined) },
      }),
    });
    const { standIn } = vehicleAndStandIn();
    const send = (hitEntity: unknown, damagingEntity: unknown = player) =>
      onHit({ damagingEntity, hitEntity } as EntityHitEntityAfterEvent);
    send(standIn, { id: "zombie" });
    expect(hit.execute).not.toHaveBeenCalled();
    send(standIn);
    expect(hit.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "player",
      vehicleId: "camper",
      fromDeck: false,
    });
    const [dye, dyePaint] = defined(
      Object.entries(PAINT_BY_DYE)[0],
      "a dye paint",
    );
    held = dye;
    send(standIn);
    expect(paint.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: "player",
      vehicleId: "camper",
      paint: dyePaint,
    });
    send(vehicleAndStandIn("gone").standIn);
    expect(hit.execute).toHaveBeenCalledOnce();
    expect(paint.execute).toHaveBeenCalledOnce();
  });

  it("never lets a player ride the stand-in, and boards them into its camper instead", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom("none", "camper", "other"),
        fc.constantFrom(undefined, HEADLIGHT_SWITCH_TYPE, "minecraft:stick"),
        (sneaking, riding, item) => {
          const headlights = { execute: vi.fn(() => true) };
          const ceilingLights = {
            execute: vi.fn(() => true),
            canSwitch: vi.fn(() => true),
          };
          subscribe({ headlights, ceilingLights });
          // Only the callbacks the interaction schedules run below.
          game.run.mockClear();
          const handlers = vi
            .mocked(world.beforeEvents.playerInteractWithEntity.subscribe)
            .mock.calls.slice(-2)
            .map(([handler]) => handler);
          const { camper, standIn, rideable } = vehicleAndStandIn();
          const player = {
            id: "player",
            isValid: true,
            isSneaking: sneaking,
            dimension: { id: "overworld" },
            location: { x: 0.5, y: 64, z: 0.5 },
            getComponent: (name: string) =>
              name === "minecraft:riding" && riding !== "none"
                ? {
                    entityRidingOn:
                      riding === "camper" ? camper : { id: "horse" },
                  }
                : undefined,
          };
          const ev = {
            player,
            target: standIn,
            itemStack: item ? { typeId: item } : undefined,
            cancel: false,
          };
          for (const handler of handlers)
            handler(ev as unknown as PlayerInteractWithEntityBeforeEvent);
          expect(ev.cancel).toBe(true);
          for (const [callback] of game.run.mock.calls) callback();
          // The switch never boards: the switch router and the vehicle's switch target
          // take it or leave it (ADR 0115).
          const boards =
            !sneaking && riding !== "camper" && item !== HEADLIGHT_SWITCH_TYPE;
          expect(rideable.addRider).toHaveBeenCalledTimes(boards ? 1 : 0);
          const switches =
            riding === "camper" && item === HEADLIGHT_SWITCH_TYPE;
          expect(headlights.execute).toHaveBeenCalledTimes(switches ? 1 : 0);
          if (switches)
            expect(headlights.execute).toHaveBeenCalledWith({
              playerId: "player",
              vehicleId: "camper",
            });
        },
      ),
    );
  });

  it("gives a switch press on the stand-in by a player on foot in the camper's room to its ceiling lights, without boarding (ADR 0115)", () => {
    const f = lightSwitchFixture();
    const rideable = { addRider: vi.fn(() => true) };
    const room = {
      id: "room",
      typeId: ENTITY_TYPE.camper,
      isValid: true,
      getComponent: (name: string) =>
        name === "minecraft:rideable" ? rideable : undefined,
    };
    game.getEntity.mockImplementation((id: string) =>
      id === room.id ? room : undefined,
    );
    const standIn = {
      id: "bumper",
      typeId: BUMPER,
      isValid: true,
      getDynamicProperty: (key: string) =>
        key === STAND_IN_OF_PROPERTY ? room.id : undefined,
    };
    expect(f.pressEntity(standIn)).toBe(true);
    f.nextTick();
    expect(f.ceilingLights.execute).toHaveBeenCalledExactlyOnceWith(inRoom);
    expect(f.headlights.execute).not.toHaveBeenCalled();
    expect(rideable.addRider).not.toHaveBeenCalled();
  });

  it("removes a stand-in that loads without its camper, and keeps the one its camper names", () => {
    subscribe({ limit: { start: vi.fn(), found: vi.fn(), spawned: vi.fn() } });
    const load = defined(
      vi.mocked(world.afterEvents.entityLoad.subscribe).mock.calls.at(-1)?.[0],
      "entityLoad handler",
    );
    const camper = {
      id: "camper",
      typeId: ENTITY_TYPE.camper,
      getDynamicProperty: (key: string) =>
        key === STAND_IN_PROPERTY ? "kept" : undefined,
    };
    const standIn = (id: string, near: unknown[]) => ({
      id,
      typeId: BUMPER,
      isValid: true,
      location: { x: 0, y: 0, z: 0 },
      dimension: { getEntities: () => near },
      getDynamicProperty: (key: string) =>
        key === STAND_IN_OF_PROPERTY ? "camper" : undefined,
      remove: vi.fn(),
    });
    const kept = standIn("kept", [camper]);
    const stray = standIn("stray", [camper]);
    const orphan = standIn("kept", []);
    for (const entity of [kept, stray, orphan])
      load({ entity } as unknown as EntityLoadAfterEvent);
    expect(kept.remove).not.toHaveBeenCalled();
    expect(stray.remove).toHaveBeenCalledOnce();
    expect(orphan.remove).toHaveBeenCalledOnce();
  });
});

describe("blade switch (ADR 0138)", () => {
  const location = { x: 2.5, y: 64, z: 3.5 };
  function fixture(
    mount: { id: string; typeId: string } | null = {
      id: "dozer",
      typeId: ENTITY_TYPE.bulldozer,
    },
    result = true,
  ) {
    const playSound = vi.fn();
    const vehicle = mount
      ? { ...mount, dimension: { playSound }, location }
      : undefined;
    const blade = { execute: vi.fn(() => result), force: vi.fn() };
    const headlights = { execute: vi.fn(() => false) };
    const ceilingLights = { execute: vi.fn(), canSwitch: vi.fn(() => false) };
    const later = {
      claimsItemUse: () => true,
      claimsEntityPress: () => true,
      claimsBlockPress: () => true,
      switchFor: vi.fn(),
    };
    const usesBefore = game.use.mock.calls.length;
    const entities = vi.mocked(
      world.beforeEvents.playerInteractWithEntity.subscribe,
    );
    const entitiesBefore = entities.mock.calls.length;
    registerSubscriptions(
      {
        blade,
        headlights,
        ceilingLights,
        board: { execute: vi.fn(() => false) },
      } as unknown as Parameters<typeof registerSubscriptions>[0],
      new VehicleTestStore<RawInput>(),
      () => undefined,
      () => undefined,
      () => undefined,
      () => [later],
    );
    const onBlock = defined(game.before.mock.calls.at(-2)?.[0], "block press");
    const onEntity = entities.mock.calls.slice(entitiesBefore).map(([h]) => h);
    const uses = game.use.mock.calls.slice(usesBefore).map(([h]) => h);
    game.run.mockClear();
    const player = {
      id: "player",
      isValid: true,
      dimension: { id: "overworld" },
      location,
      getHeadLocation: () => location,
      getViewDirection: () => ({ x: 0, y: 0, z: 1 }),
      inputInfo: { lastInputModeUsed: "KeyboardAndMouse" },
      getComponent: (name: string) =>
        name === "minecraft:riding" && vehicle
          ? { entityRidingOn: vehicle }
          : undefined,
    };
    return {
      blade,
      headlights,
      ceilingLights,
      later,
      playSound,
      send(
        kind: "item" | "entity" | "block",
        typeId: string | undefined,
        target = { id: "dozer", typeId: ENTITY_TYPE.bulldozer },
        isFirstEvent = true,
      ) {
        const itemStack = typeId === undefined ? undefined : { typeId };
        const ev = {
          player,
          source: player,
          itemStack,
          target: { ...target, location },
          isFirstEvent,
          cancel: false,
        };
        if (kind === "item")
          for (const h of uses) h(ev as unknown as ItemUseAfterEvent);
        if (kind === "entity")
          for (const h of onEntity)
            h(ev as unknown as PlayerInteractWithEntityBeforeEvent);
        if (kind === "block")
          onBlock(ev as unknown as PlayerInteractWithBlockBeforeEvent);
        return ev;
      },
      nextTick() {
        for (const [callback] of game.run.mock.calls) callback();
        game.run.mockClear();
      },
    };
  }
  it("routes each switch item to its own targets only", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          HEADLIGHT_SWITCH_TYPE,
          BLADE_SWITCH_TYPE,
          "minecraft:stick",
          undefined,
        ),
        fc.constantFrom("item", "entity", "block"),
        (type, kind) => {
          fc.pre(type !== undefined || kind !== "item");
          const f = fixture();
          const ev = f.send(kind, type);
          if (kind === "entity") expect(f.blade.execute).not.toHaveBeenCalled();
          f.nextTick();
          expect(f.blade.execute).toHaveBeenCalledTimes(
            type === BLADE_SWITCH_TYPE && kind !== "block" ? 1 : 0,
          );
          if (type === BLADE_SWITCH_TYPE) {
            expect(f.headlights.execute).not.toHaveBeenCalled();
            expect(f.ceilingLights.execute).not.toHaveBeenCalled();
            expect(f.later.switchFor).not.toHaveBeenCalled();
          }
          if (type === undefined) expect(ev.cancel).toBe(false);
        },
      ),
    );
  });
  it("switches the ridden bulldozer's blade on item use and clicks only when it switched", () => {
    for (const result of [true, false]) {
      const f = fixture({ id: "dozer", typeId: ENTITY_TYPE.bulldozer }, result);
      f.send("item", BLADE_SWITCH_TYPE);
      expect(f.blade.execute).toHaveBeenCalledExactlyOnceWith({
        playerId: "player",
        vehicleId: "dozer",
      });
      expect(f.playSound).toHaveBeenCalledTimes(result ? 1 : 0);
      if (result)
        expect(f.playSound).toHaveBeenCalledWith("random.click", location);
    }
  });
  it("ignores the blade switch on foot or on another mount", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, { id: "pig", typeId: "minecraft:pig" }),
        fc.constantFrom("item", "entity", "block"),
        fc.constantFrom(
          { id: "cow", typeId: "minecraft:cow" },
          { id: "dozer", typeId: ENTITY_TYPE.bulldozer },
        ),
        (mount, kind, target) => {
          const f = fixture(mount ?? null);
          expect(f.send(kind, BLADE_SWITCH_TYPE, target).cancel).toBe(false);
          expect(game.run).not.toHaveBeenCalled();
          expect(f.blade.execute).not.toHaveBeenCalled();
          expect(f.playSound).not.toHaveBeenCalled();
        },
      ),
    );
  });
  it("takes a rider's press on their own vehicle, and nothing else", () => {
    for (const [target, item, claimed] of [
      [{ id: "dozer", typeId: ENTITY_TYPE.bulldozer }, BLADE_SWITCH_TYPE, true],
      [{ id: "cow", typeId: "minecraft:cow" }, BLADE_SWITCH_TYPE, false],
      [
        { id: "other", typeId: ENTITY_TYPE.bulldozer },
        BLADE_SWITCH_TYPE,
        false,
      ],
      [
        { id: "dozer", typeId: ENTITY_TYPE.bulldozer },
        "minecraft:stick",
        false,
      ],
    ] as const) {
      const f = fixture();
      expect(f.send("entity", item, target).cancel).toBe(claimed);
      expect(f.blade.execute).not.toHaveBeenCalled();
      f.nextTick();
      expect(f.blade.execute).toHaveBeenCalledTimes(claimed ? 1 : 0);
    }
  });
  it("never takes a block press", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isFirst, riding) => {
        const f = fixture(
          riding ? { id: "dozer", typeId: ENTITY_TYPE.bulldozer } : null,
        );
        expect(
          f.send("block", BLADE_SWITCH_TYPE, undefined, isFirst).cancel,
        ).toBe(false);
        expect(f.blade.execute).not.toHaveBeenCalled();
      }),
    );
  });
});
