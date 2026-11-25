import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import { cellOf } from "../../../../src/domain/shared/cells";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../../src/domain/shared/ids";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import type { Departure } from "../../../../src/domain/vehicle/dock/dock";
import type { DockCell } from "../../../../src/domain/vehicle/dock/floor";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import type { CamperRoomBlock } from "../../../../src/domain/vehicle/kinds/camper/roomBlocks";
import {
  entityContractOf,
  profileOf,
} from "../../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  ENTITY_TYPE,
  entityPropertyId,
  HEADLIGHTS_PROPERTY,
  OWNER_PROPERTY,
  PLAYER_TYPE,
  SEAT_FILLER_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import type { RestoredReaders } from "../../../../src/infrastructure/vehicle/bedrock/restoredReaders";
import { RoadPaver } from "../../../../src/infrastructure/vehicle/bedrock/roadPaver";
import { SeatFillers } from "../../../../src/infrastructure/vehicle/bedrock/seatFillers";
import {
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  DECOR_PROPERTY,
  isStandableRoomBlock,
} from "../../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { readCamperRestored } from "../../../../src/infrastructure/vehicle/kinds/camper/restored";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";
import {
  fakeVehicleEntities,
  bedrockVehicleGame as game,
} from "../../../support/bedrockVehicleMocks";
import { blockGrid } from "../../../support/blockGrid";
import { createDockBlocks } from "../../../support/dockBlocks";

vi.mock("@minecraft/server", async () =>
  (await import("../../../support/bedrockVehicleMocks")).bedrockVehicleEngine(),
);

/** Seats one idle player, holding hotbar slot 3, on `car`; the player's components come from `getComponent`. */
function seatIdlePlayer(
  car: ReturnType<typeof fixture>["car"],
  getComponent: (name: string) => unknown,
): void {
  const player = {
    id: "player",
    typeId: "minecraft:player",
    location: car.location,
    selectedSlotIndex: 3,
    getRotation: () => ({ y: 0 }),
    getComponent,
    inputInfo: {
      getMovementVector: () => ({ x: 0, y: 0 }),
      getButtonState: () => "Released",
    },
  };
  car.getComponent.mockImplementation((name) =>
    name === "minecraft:rideable" ? { getRiders: () => [player] } : undefined,
  );
}

function fixture(
  restoredReaders: RestoredReaders = {},
  docks = createDockBlocks(noCampSpace),
) {
  const { car, dimension, entities } = fakeVehicleEntities();
  const inputs = new VehicleTestStore<RawInput>();
  const testHeldItems = new VehicleTestStore<string>();
  const index = new EntityIndex();
  return {
    index,
    inputs,
    testHeldItems,
    entities,
    dimension,
    car,
    world: new BedrockVehicleWorld(
      index,
      inputs,
      testHeldItems,
      noCampSpace,
      docks,
      restoredReaders,
      isStandableRoomBlock,
    ),
  };
}

describe("BedrockVehicleWorld submarine wiring (ADR 0040)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    ["minecraft:water", false],
    ["minecraft:flowing_water", false],
    ["minecraft:bubble_column", false],
    ["minecraft:kelp", true],
    ["minecraft:seagrass", true],
  ])(
    "counts %s as water and probes at floored x/z",
    (typeId, isWaterlogged) => {
      const { dimension, world } = fixture();
      dimension.getBlock.mockReturnValue({ typeId, isWaterlogged });
      world.loadedVehicles();
      expect(dimension.getBlock).not.toHaveBeenCalled();
      for (const y of [0, 1, 2, -0.3])
        expect(world.waterAt(asVehicleId("car"), { x: 0, y, z: 0 })).toBe(true);
      expect(dimension.getBlock.mock.calls.map(([at]) => at)).toEqual([
        { x: -2, y: 64, z: 2 },
        { x: -2, y: 65, z: 2 },
        { x: -2, y: 66, z: 2 },
        { x: -2, y: 63, z: 2 },
      ]);
    },
  );

  it.each([undefined, { typeId: "minecraft:lava", isWaterlogged: false }])(
    "treats undefined blocks and lava as dry",
    (block) => {
      const { dimension, world } = fixture();
      dimension.getBlock.mockReturnValue(block);
      world.loadedVehicles();
      for (const y of [0, -0.3])
        expect(world.waterAt(asVehicleId("car"), { x: 0, y, z: 0 })).toBe(
          false,
        );
    },
  );

  it("stops at an unloaded cell without dropping the snapshot", () => {
    const { dimension, world } = fixture();
    dimension.getBlock.mockReturnValueOnce({ typeId: "minecraft:water" });
    dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded");
    });
    const snap = world.loadedVehicles()[0];
    expect(snap?.id).toBe("car");
    expect(world.waterAt(asVehicleId("car"), { x: 0, y: 0, z: 0 })).toBe(true);
    expect(world.waterAt(asVehicleId("car"), { x: 0, y: 1, z: 0 })).toBe(false);
    expect(world.waterAt(asVehicleId("car"), { x: 0, y: -0.3, z: 0 })).toBe(
      false,
    );
  });

  it("returns false for a missing entity", () => {
    const { world } = fixture();
    expect(world.waterAt(asVehicleId("missing"), { x: 1, y: 2, z: 3 })).toBe(
      false,
    );
  });

  it("applies all offset axes before flooring the water cell", () => {
    const { world, dimension } = fixture();
    world.waterAt(asVehicleId("car"), { x: 2.5, y: -0.5, z: -4 });
    expect(dimension.getBlock).toHaveBeenCalledWith({ x: 1, y: 63, z: -2 });
  });

  it("refreshes breathing without particles and ignores a missing player", () => {
    const { world } = fixture();
    const addEffect = vi.fn();
    game.getEntity.mockImplementation((id: string) =>
      id === "rider" ? { typeId: "minecraft:player", addEffect } : undefined,
    );
    world.giveWaterBreathing(asPlayerId("rider"), SPEC.waterBreathingTicks);
    world.giveWaterBreathing(asPlayerId("missing"), SPEC.waterBreathingTicks);
    expect(addEffect.mock.calls).toEqual([
      ["water_breathing", SPEC.waterBreathingTicks, { showParticles: false }],
    ]);
  });
});

describe("BedrockVehicleWorld snapshots", () => {
  const cow = {
    id: "cow",
    typeId: "minecraft:cow",
    location: { x: 0, y: 64, z: 0 },
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: () => undefined,
    getComponent: () => undefined,
    inputInfo: {
      getMovementVector: () => ({ x: 0, y: 0 }),
      getButtonState: () => undefined,
    },
  };

  beforeEach(() => vi.resetAllMocks());

  it("snapshots only vehicles, not the other entities in the dimension", () => {
    const { entities, car, world } = fixture();
    entities.push({
      ...car,
      id: "cow",
      typeId: "minecraft:cow",
      families: ["cow"],
    });
    expect(world.loadedVehicles().map((s) => s.id)).toEqual(["car"]);
  });

  it("snapshots the vehicles of every dimension, not only the first one that has any", () => {
    fc.assert(
      fc.property(fc.subarray(["overworld", "nether", "the_end"]), (dimIds) => {
        const { car, world } = fixture();
        const cars = new Map(
          dimIds.map((dimId) => [
            dimId,
            {
              ...car,
              id: `car-${dimId}`,
              typeId: ENTITY_TYPE.sportsboat,
              getDynamicProperty: (key: string) =>
                key === OWNER_PROPERTY ? `owner-${dimId}` : undefined,
            },
          ]),
        );
        game.getDimension.mockImplementation((id: string) => {
          const inDim = cars.get(id);
          return { getEntities: () => (inDim ? [inDim] : []) };
        });
        const ids = dimIds.map((dimId) => `car-${dimId}`);
        expect(world.loadedVehicles().map((s) => s.id)).toEqual(ids);
      }),
    );
  });

  it("skips an unknown entity in vehicle snapshots", () => {
    const { entities, car, world } = fixture();
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(
      world.loadedVehicles().map((s) => ({ id: s.id, kind: s.kind })),
    ).toEqual([{ id: car.id, kind: "suv" }]);
  });

  it("reports the headlights as the vehicle's headlights property says (ADR 0020)", () => {
    fc.assert(
      fc.property(fc.constantFrom(true, false, undefined, "true"), (value) => {
        const { car, world } = fixture();
        car.getProperty.mockImplementation((key) =>
          key === HEADLIGHTS_PROPERTY ? value : undefined,
        );
        expect(world.loadedVehicles()[0]?.headlights).toBe(value === true);
      }),
    );
  });

  it.each(VEHICLE_KINDS.filter((kind) => !profileOf(kind).equipment))(
    "does not read rider inventory for %s without a monitor rule",
    (kind) => {
      const { car, world } = fixture();
      car.typeId = ENTITY_TYPE[kind];
      const inventory = vi.fn();
      seatIdlePlayer(car, inventory);
      const riders = world.loadedVehicles()[0]?.riders;
      expect(riders?.map((r) => r.id)).toEqual(["player"]);
      expect(riders?.[0]?.held).toBeUndefined();
      expect(inventory).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["yasu_ride:blade_switch", "blade_switch"],
    ["minecraft:stone", undefined],
    [undefined, undefined],
  ])(
    "reads the bulldozer driver's held %s as %s for its monitor rule (ADR 0139)",
    (typeId, tool) => {
      const { car, world } = fixture();
      car.typeId = ENTITY_TYPE.bulldozer;
      const getItem = vi.fn(() => (typeId ? { typeId } : undefined));
      seatIdlePlayer(car, (name) =>
        name === "minecraft:inventory" ? { container: { getItem } } : undefined,
      );
      expect(world.loadedVehicles()[0]?.riders[0]?.held?.tool).toBe(tool);
      expect(getItem).toHaveBeenCalledWith(3);
    },
  );

  it("counts only players in the seats as riders (ADR 0019)", () => {
    const { car, world } = fixture();
    const player = {
      id: "player",
      typeId: "minecraft:player",
      location: { x: 0, y: 64, z: 0 },
      getRotation: () => ({ y: 0 }),
      inputInfo: {
        getMovementVector: () => ({ x: 0, y: 1 }),
        getButtonState: () => "Released",
      },
    };
    car.getComponent.mockImplementation((name) =>
      name === "minecraft:rideable"
        ? { getRiders: () => [cow, player] }
        : undefined,
    );
    expect(world.loadedVehicles()[0]?.riders.map((r) => r.id)).toEqual([
      "player",
    ]);
    // The slot counts every rider, since the engine seats by list index (ADR 0019, 0120).
    expect(world.loadedVehicles()[0]?.riders.map((r) => r.slot)).toEqual([1]);
  });

  it("counts a player the seat layout took off as riding, in the slot they wait for (ADR 0120)", () => {
    const { car, dimension, world } = fixture();
    const filler = { id: "filler", typeId: SEAT_FILLER_TYPE, isValid: true };
    const player = {
      id: "player",
      typeId: PLAYER_TYPE,
      isValid: true,
      dimension,
      location: { x: 0, y: 64, z: 2 },
      riding: true,
      getComponent: (name: string) =>
        name === "minecraft:riding" && player.riding
          ? { entityRidingOn: car }
          : undefined,
      getRotation: () => ({ y: 0 }),
      inputInfo: {
        getMovementVector: () => ({ x: 0, y: 0 }),
        getButtonState: () => "Released",
      },
    };
    const riders: { id: string }[] = [filler, player];
    car.getComponent.mockImplementation((name) =>
      name === "minecraft:rideable"
        ? {
            seatCount: 4,
            getRiders: () => [...riders],
            ejectRider: (rider: { id: string }) => {
              riders.splice(riders.indexOf(rider), 1);
              if (rider === player) player.riding = false;
            },
            // The engine does not take back a rider in the tick they got off.
            addRider: (rider: { id: string }) => {
              if (rider === player) return false;
              riders.push(rider);
              return true;
            },
          }
        : undefined,
    );
    dimension.spawnEntity.mockImplementation(() => ({
      id: "filler2",
      typeId: SEAT_FILLER_TYPE,
      isValid: true,
    }));
    game.getEntity.mockImplementation((id: string) =>
      id === car.id ? car : id === player.id ? player : undefined,
    );
    expect(world.loadedVehicles()[0]?.riders.map((r) => r.slot)).toEqual([1]);
    world.keepSeatLayout(asVehicleId("car"), [
      undefined,
      undefined,
      asPlayerId("player"),
    ]);
    expect(riders.map((r) => r.id)).toEqual(["filler", "filler2"]);
    const snapshot = world.loadedVehicles()[0]?.riders;
    expect(snapshot?.map((r) => [r.id, r.slot])).toEqual([["player", 2]]);
  });

  it("forgets the test input of a vehicle once it is no longer loaded (ADR 0010)", () => {
    const { inputs, dimension, car, world } = fixture();
    const input = { moveX: 0, moveY: 1, jump: false };
    inputs.set(asVehicleId(car.id), input);
    expect(world.loadedVehicles()[0]?.testInput).toEqual(input);
    expect(world.loadedVehicles()[0]?.testInput).toEqual(input);
    dimension.getEntities.mockReturnValue([]);
    expect(world.loadedVehicles()).toEqual([]);
    expect(inputs.get(asVehicleId(car.id))).toEqual(input);
    world.sweepGone(new Set());
    dimension.getEntities.mockReturnValue([car]);
    expect(world.loadedVehicles()[0]?.testInput).toBeUndefined();
  });

  it("forgets the test held item of a vehicle once it is no longer loaded (ADR 0139)", () => {
    const { testHeldItems, dimension, car, world } = fixture();
    const id = asVehicleId(car.id);
    testHeldItems.set(id, "yasu_ride:blade_switch");
    expect(world.loadedVehicles()[0]?.testHeld?.tool).toBe("blade_switch");
    dimension.getEntities.mockReturnValue([]);
    expect(world.loadedVehicles()).toEqual([]);
    expect(testHeldItems.get(id)).toBe("yasu_ride:blade_switch");
    world.sweepGone(new Set());
    expect(testHeldItems.get(id)).toBeUndefined();
  });

  it("clears the headlight blocks of a vehicle once it is no longer loaded (ADR 0020, 0038)", () => {
    const { dimension, car, world } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { ...cellOf({ ...cellOf({ x: 0, y: 65, z: 4 }) }), level: 15 };
    world.loadedVehicles();
    world.shineHeadlights(asVehicleId(car.id), [cell]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:light_block_15");
    dimension.getEntities.mockReturnValue([]);
    expect(world.loadedVehicles()).toEqual([]);
    world.sweepGone(new Set());
    expect(grid.typeAt(cell)).toBe("minecraft:air");
  });
});

describe("BedrockVehicleWorld ram targets (ADR 0006)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports what each nearby entity rides as its ram mount", () => {
    const { dimension, car, world } = fixture();
    const near = (id: string, x: number, riding: unknown) => ({
      id,
      location: { x, y: 64.5, z: 3 },
      getComponent: (name: string) =>
        name === "minecraft:riding" ? riding : undefined,
    });
    dimension.getEntities.mockReturnValue([
      car,
      near("boatRider", 0, {
        entityRidingOn: { typeId: ENTITY_TYPE.sportsboat },
      }),
      near("deckRider", 1, { entityRidingOn: { typeId: DECK_SEAT_TYPE } }),
      near("walker", 2, undefined),
    ]);
    expect(world.targetsNear(asVehicleId("car"))).toEqual([
      {
        id: "boatRider",
        offset: { x: 1.25, y: 0.25, z: 0.25 },
        mount: "vehicle",
      },
      {
        id: "deckRider",
        offset: { x: 2.25, y: 0.25, z: 0.25 },
        mount: "deckSeat",
      },
      { id: "walker", offset: { x: 3.25, y: 0.25, z: 0.25 }, mount: undefined },
    ]);
    expect(dimension.getEntities).toHaveBeenCalledWith(
      expect.objectContaining({ location: car.location }),
    );
    expect(world.targetsNear(asVehicleId("missing"))).toEqual([]);
  });
});

describe("BedrockVehicleWorld flight wiring", () => {
  beforeEach(() => vi.resetAllMocks());

  it("switches a rider to the third-person camera and back (ADR 0028)", () => {
    const { world } = fixture();
    const camera = { setCamera: vi.fn(), clear: vi.fn() };
    game.getEntity.mockImplementation((id: string) =>
      id === "rider" ? { typeId: "minecraft:player", camera } : undefined,
    );
    world.setChaseCamera(asPlayerId("rider"), "near");
    expect(camera.setCamera.mock.calls).toEqual([["minecraft:third_person"]]);
    expect(camera.clear).not.toHaveBeenCalled();
    world.setChaseCamera(asPlayerId("rider"), undefined);
    expect(camera.clear).toHaveBeenCalledTimes(1);
    expect(camera.setCamera).toHaveBeenCalledTimes(1);
  });

  it("switches a rider to the pack's far chase preset (ADR 0071)", () => {
    const { world } = fixture();
    const camera = { setCamera: vi.fn(), clear: vi.fn() };
    game.getEntity.mockImplementation((id: string) =>
      id === "rider" ? { typeId: "minecraft:player", camera } : undefined,
    );
    world.setChaseCamera(asPlayerId("rider"), "far");
    expect(camera.setCamera.mock.calls).toEqual([["yasu_ride:far_chase"]]);
  });
});

describe("BedrockVehicleWorld command interpreter", () => {
  beforeEach(() => vi.resetAllMocks());

  it("runs all four commands in order at the vehicle", () => {
    const { world, car, dimension } = fixture();
    world.run(asVehicleId(car.id), [
      { type: "setProperty", name: "bank", value: 12 },
      { type: "triggerEvent", name: "gravity_off" },
      { type: "playAnimation", name: "door_fr" },
      { type: "playSound", name: "random.door_open" },
    ]);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 12]]);
    expect(car.triggerEvent.mock.calls).toEqual([[`${NAMESPACE}:gravity_off`]]);
    expect(car.playAnimation.mock.calls).toEqual([
      [`animation.${NAMESPACE}.suv.door_fr`],
    ]);
    expect(dimension.playSound.mock.calls).toEqual([
      ["random.door_open", car.location],
    ]);
    const order = [
      car.setProperty,
      car.triggerEvent,
      car.playAnimation,
      dimension.playSound,
    ].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  it("ignores every command when the entity is missing", () => {
    const { world, car, dimension } = fixture();
    world.run(asVehicleId("missing"), [
      { type: "setProperty", name: "bank", value: 0 },
      { type: "triggerEvent", name: "gravity_on" },
      { type: "playAnimation", name: "door_fl" },
      { type: "playSound", name: "random.door_open" },
    ]);
    for (const fn of [
      car.setProperty,
      car.triggerEvent,
      car.playAnimation,
      dimension.playSound,
    ])
      expect(fn).not.toHaveBeenCalled();
  });

  it("propagates a throw and stops the remaining commands", () => {
    const { world, car, dimension } = fixture();
    const failure = new Error("event failed");
    car.triggerEvent.mockImplementation(() => {
      throw failure;
    });
    expect(() =>
      world.run(asVehicleId(car.id), [
        { type: "setProperty", name: "bank", value: 0 },
        { type: "triggerEvent", name: "gravity_off" },
        { type: "setProperty", name: "form", value: "hover" },
        { type: "playAnimation", name: "door_fr" },
        { type: "playSound", name: "random.door_open" },
      ]),
    ).toThrow(failure);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 0]]);
    expect(car.playAnimation).not.toHaveBeenCalled();
    expect(dimension.playSound).not.toHaveBeenCalled();
  });

  // The type checker rejects a missing case, so only a command cast past the
  // type reaches the default branch.
  it("throws on an unknown command type and stops the remaining commands", () => {
    const { world, car } = fixture();
    const unknown = { type: "spawnParticle", name: "smoke" };
    expect(() =>
      world.run(asVehicleId(car.id), [
        { type: "setProperty", name: "bank", value: 0 },
        unknown as unknown as EngineCommand,
        { type: "triggerEvent", name: "gravity_off" },
      ]),
    ).toThrow(`Unknown engine command: ${JSON.stringify(unknown)}`);
    expect(car.setProperty.mock.calls).toEqual([[`${NAMESPACE}:bank`, 0]]);
    expect(car.triggerEvent).not.toHaveBeenCalled();
  });
});

it.each([
  { kind: "suv", names: ["form"], values: { form: "hover" } },
  {
    kind: "sportsboat",
    names: ["docked", "icebreaker"],
    values: { docked: true, icebreaker: true },
  },
] as const)(
  "reads only $kind's declared restored properties, lazily",
  ({ kind, names, values }) => {
    vi.resetAllMocks();
    const { world, car } = fixture();
    car.typeId = ENTITY_TYPE[kind];
    const stored: Record<string, unknown> = {
      [`${NAMESPACE}:form`]: "hover",
      [`${NAMESPACE}:docked`]: true,
      [`${NAMESPACE}:icebreaker`]: true,
    };
    car.getProperty.mockImplementation((key) => stored[key] ?? false);
    const snapshot = world.loadedVehicles()[0];
    expect(car.getProperty.mock.calls).toEqual([[HEADLIGHTS_PROPERTY]]);
    car.getProperty.mockClear();
    car.getDynamicProperty.mockClear();
    expect(snapshot?.restored()).toStrictEqual(values);
    expect(car.getDynamicProperty).not.toHaveBeenCalled();
    expect(car.getProperty.mock.calls).toEqual(
      names.map((name) => [`${NAMESPACE}:${name}`]),
    );
  },
);

it.each(VEHICLE_KINDS)(
  "runs the %s reader only on restore for its kind and gives entity properties precedence",
  (registeredKind) => {
    vi.resetAllMocks();
    fc.assert(
      fc.property(fc.string(), fc.integer(), (readerValue, entityValue) => {
        const reader = vi.fn(() => ({
          readerValue,
          ...Object.fromEntries(
            entityContractOf(registeredKind).restored.map((name) => [
              name,
              readerValue,
            ]),
          ),
        }));
        for (const kind of VEHICLE_KINDS) {
          reader.mockClear();
          const { world, car } = fixture({ [registeredKind]: reader });
          car.typeId = ENTITY_TYPE[kind];
          const names = entityContractOf(kind).restored;
          car.getProperty.mockImplementation((key) =>
            names.some((name) => entityPropertyId(name) === key)
              ? entityValue
              : undefined,
          );
          const [snapshot] = world.loadedVehicles();
          expect(reader).not.toHaveBeenCalled();
          expect(car.getProperty.mock.calls).toEqual([[HEADLIGHTS_PROPERTY]]);
          car.getDynamicProperty.mockClear();

          expect(snapshot?.restored()).toStrictEqual({
            ...(kind === registeredKind ? { readerValue } : {}),
            ...Object.fromEntries(names.map((name) => [name, entityValue])),
          });
          if (kind === registeredKind)
            expect(reader).toHaveBeenCalledExactlyOnceWith(car);
          else expect(reader).not.toHaveBeenCalled();
          expect(car.getDynamicProperty).not.toHaveBeenCalled();
        }
      }),
    );
  },
);

describe("BedrockVehicleWorld holds (ADR 0063)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("teleports and clears velocity on every held tick, then releases motion", () => {
    const { world, car } = fixture();
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    const impulse = { x: 0, y: 0, z: 1 };
    for (let tick = 0; tick < 3; tick++) {
      world.holdAt(asVehicleId(car.id), pose);
      world.applyMotion(asVehicleId(car.id), impulse, pose.yaw);
    }
    expect(car.teleport.mock.calls).toEqual(
      Array.from({ length: 3 }, () => [
        { x: pose.x, y: pose.y, z: pose.z },
        { rotation: { x: 0, y: pose.yaw } },
      ]),
    );
    expect(car.clearVelocity).toHaveBeenCalledTimes(3);
    expect(car.applyImpulse).not.toHaveBeenCalled();
    world.holdAt(asVehicleId(car.id), undefined);
    world.applyMotion(asVehicleId(car.id), impulse, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledWith(impulse);
    expect(car.setRotation).toHaveBeenCalledWith({ x: 0, y: pose.yaw });
    world.holdAt(asVehicleId("missing"), pose);
    expect(car.teleport).toHaveBeenCalledTimes(3);
  });

  it("clears the floor and releases the hold of a vehicle that is no longer loaded (ADR 0038)", () => {
    const { dimension, world, car } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = {
      ...cellOf({ ...cellOf({ x: 0, y: 64, z: 3 }) }),
      block: { type: "deck" as const, height: 9 },
    };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(asVehicleId(car.id), pose);
    world.layDock(asVehicleId(car.id), [cell]);
    dimension.getEntities.mockReturnValue([]);
    expect(world.loadedVehicles()).toEqual([]);
    world.sweepGone(new Set());
    expect(grid.typeAt(cell)).toBe("minecraft:air");
    dimension.getEntities.mockReturnValue([car]);
    world.loadedVehicles();
    world.applyMotion(asVehicleId(car.id), { x: 0, y: 0, z: 1 }, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledOnce();
  });

  it("releases the floor, the lights and the hold of a vehicle that is gone", () => {
    const { dimension, world, car } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const deck = {
      ...cellOf({ ...cellOf({ x: 0, y: 64, z: 3 }) }),
      block: { type: "deck" as const, height: 9 },
    };
    const light = {
      ...cellOf({ ...cellOf({ x: 0, y: 65, z: 4 }) }),
      level: 15,
    };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(asVehicleId(car.id), pose);
    world.layDock(asVehicleId(car.id), [deck]);
    world.shineHeadlights(asVehicleId(car.id), [light]);
    expect(grid.typeAt(deck)).toBe(DECK_FLOOR_BLOCK);
    expect(grid.typeAt(light)).toBe("minecraft:light_block_15");
    car.setDynamicProperty.mockClear();
    car.isValid = false;
    world.releaseVehicle(asVehicleId(car.id));
    expect(grid.typeAt(deck)).toBe("minecraft:air");
    expect(grid.typeAt(light)).toBe("minecraft:air");
    expect(car.setDynamicProperty).not.toHaveBeenCalled();
    car.isValid = true;
    world.applyMotion(asVehicleId(car.id), { x: 0, y: 0, z: 1 }, pose.yaw);
    expect(car.applyImpulse).toHaveBeenCalledOnce();
  });
});

describe("BedrockVehicleWorld deck seats (ADR 0063)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the input of each deck seat rider and boards them onto the boat", () => {
    const { car, world } = fixture();
    const player = {
      id: "player",
      typeId: "minecraft:player",
      inputInfo: {
        getMovementVector: () => ({ x: 0.5, y: 1 }),
        getButtonState: () => "Released",
      },
    };
    const seatRiders: unknown[] = [player];
    const seatRideable = {
      getRiders: () => seatRiders,
      ejectRider: vi.fn(() => seatRiders.splice(0)),
      addRider: vi.fn(),
    };
    const seat = {
      id: "seat0",
      typeId: DECK_SEAT_TYPE,
      isValid: true,
      getDynamicProperty: (key: string) =>
        key === DECK_SEAT_OF_PROPERTY ? car.id : undefined,
      getComponent: () => seatRideable,
    };
    const boatRideable = { getRiders: () => [], addRider: vi.fn(() => true) };
    car.getDynamicProperty.mockImplementation((key: string) =>
      key === DECK_SEATS_PROPERTY
        ? JSON.stringify([seat.id, "empty"])
        : undefined,
    );
    car.getComponent.mockImplementation((name: string) =>
      name === "minecraft:rideable" ? boatRideable : undefined,
    );
    game.getEntity.mockImplementation((id: string) =>
      id === car.id ? car : id === seat.id ? seat : undefined,
    );
    expect(world.loadedVehicles()[0]?.deckSeatInputs).toEqual([
      { moveX: 0.5, moveY: 1, jump: false },
      undefined,
    ]);
    world.boardDeckRiders(asVehicleId("missing"));
    expect(boatRideable.addRider).not.toHaveBeenCalled();
    world.boardDeckRiders(asVehicleId(car.id));
    expect(seatRideable.ejectRider).toHaveBeenCalledWith(player);
    expect(boatRideable.addRider).toHaveBeenCalledWith(player);
  });
});

describe("BedrockVehicleWorld dock ports", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads world cells in order, normalizes air and light, and tolerates unavailable blocks", () => {
    const { world, dimension } = fixture();
    const cells = Array.from({ length: 7 }, (_, x) => ({ x, y: 64, z: 5 }));
    dimension.getBlock
      .mockReturnValueOnce({ typeId: "minecraft:air", isAir: true })
      .mockReturnValueOnce({ typeId: "minecraft:light_block_15" })
      .mockReturnValueOnce({
        typeId: "minecraft:light_block",
        permutation: { getState: () => 7 },
      })
      .mockReturnValueOnce({ typeId: "minecraft:stone" })
      .mockReturnValueOnce({ typeId: "minecraft:water" })
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => {
        throw new Error("unloaded");
      });
    expect(world.blockTypes(asVehicleId("car"), cells)).toEqual([
      "minecraft:air",
      "minecraft:air",
      "minecraft:air",
      "minecraft:stone",
      "minecraft:water",
      undefined,
      undefined,
    ]);
    expect(dimension.getBlock.mock.calls).toEqual(cells.map((c) => [c]));
    dimension.getBlock.mockClear();
    expect(world.blockTypes(asVehicleId("missing"), cells)).toEqual(
      cells.map(() => undefined),
    );
    expect(dimension.getBlock).not.toHaveBeenCalled();
  });

  it("clears only cells whose checked type still matches", () => {
    const { world, dimension } = fixture();
    const matching = { typeId: "minecraft:short_grass", setType: vi.fn() };
    const replacement = { typeId: "minecraft:stone", setType: vi.fn() };
    dimension.getBlock
      .mockReturnValueOnce(matching)
      .mockReturnValueOnce(replacement)
      .mockReturnValueOnce(undefined)
      .mockImplementationOnce(() => {
        throw new Error("unloaded");
      });
    const cells = Array.from({ length: 4 }, (_, x) => ({
      ...cellOf({ x, y: 64, z: 0 }),
      typeId: "minecraft:short_grass",
    }));
    world.clearBlocks(asVehicleId("missing"), cells);
    expect(dimension.getBlock).not.toHaveBeenCalled();
    world.clearBlocks(asVehicleId("car"), cells);
    expect(matching.setType).toHaveBeenCalledExactlyOnceWith("minecraft:air");
    expect(replacement.setType).not.toHaveBeenCalled();
  });

  it("shows the translated message on a present player's action bar", () => {
    const { world } = fixture();
    const player = {
      typeId: PLAYER_TYPE,
      onScreenDisplay: { setActionBar: vi.fn() },
    };
    game.getEntity.mockImplementation((id) =>
      id === "player" ? player : undefined,
    );
    world.showMessage(asPlayerId("missing"), "park_blocked");
    expect(player.onScreenDisplay.setActionBar).not.toHaveBeenCalled();
    world.showMessage(asPlayerId("player"), "park_blocked");
    expect(player.onScreenDisplay.setActionBar).toHaveBeenCalledExactlyOnceWith(
      { translate: "yasu_ride.message.park_blocked" },
    );
  });

  function departWithRefusedDeckRider(exit: Departure["exit"]) {
    const { world, car, dimension } = fixture();
    car.location = { x: 0, y: 64, z: 0 };
    const player = (id: string, location: Vec3) => ({
      id,
      typeId: PLAYER_TYPE,
      location,
      getComponent: vi.fn(() => undefined),
      teleport: vi.fn(),
    });
    const toilet = player("toilet", { x: 1, y: 64, z: 1 });
    const near = player("near", { x: 0, y: 64, z: 0 });
    const seatRiders: unknown[] = [toilet];
    const seatRideable = {
      getRiders: () => seatRiders,
      ejectRider: vi.fn(() => seatRiders.splice(0)),
    };
    const seat = {
      id: "seat4",
      typeId: DECK_SEAT_TYPE,
      isValid: true,
      getDynamicProperty: (key: string) =>
        key === DECK_SEAT_OF_PROPERTY ? car.id : undefined,
      getComponent: () => seatRideable,
    };
    car.getDynamicProperty.mockImplementation((key: string) =>
      key === DECK_SEATS_PROPERTY ? JSON.stringify([seat.id]) : undefined,
    );
    game.getEntity.mockImplementation((id: string) =>
      id === car.id ? car : id === seat.id ? seat : undefined,
    );
    dimension.getPlayers.mockReturnValue([toilet, near]);
    const addRider = vi.fn().mockReturnValue(false);
    car.getComponent.mockImplementation((name: string) =>
      name === "minecraft:rideable" ? { addRider } : undefined,
    );
    world.seatStandingPlayers(asVehicleId("car"), {
      boxes: [
        { min: { x: 0, y: 64, z: 0 }, max: { x: 3, y: 67, z: 3 } },
        { min: { x: -3, y: 64, z: 0 }, max: { x: 0, y: 67, z: 3 } },
      ],
      exit,
    });
    expect(seatRideable.ejectRider).toHaveBeenCalledExactlyOnceWith(toilet);
    expect(addRider.mock.calls).toEqual([[toilet], [near]]);
    return { toilet, near };
  }

  it("moves a deck rider the camper refused at departure to the exit before standing players (ADR 0095)", () => {
    const exit = { x: 5, y: 64, z: 2, yaw: 90 };
    const { toilet, near } = departWithRefusedDeckRider(exit);
    for (const p of [toilet, near])
      expect(p.teleport).toHaveBeenCalledExactlyOnceWith(exit, {
        rotation: { x: 0, y: 90 },
      });
  });

  it("leaves a refused deck rider standing when the exit is blocked (ADR 0095)", () => {
    const { toilet, near } = departWithRefusedDeckRider(undefined);
    expect(toilet.teleport).not.toHaveBeenCalled();
    expect(near.teleport).not.toHaveBeenCalled();
  });

  it("leaves a rider the seat layout is about to seat again out of the departure exit (ADR 0154)", () => {
    const { world, car, dimension } = fixture();
    car.location = { x: 0, y: 64, z: 0 };
    const player = (id: string) => ({
      id,
      location: { x: 1, y: 64, z: 1 },
      getComponent: vi.fn(() => undefined),
      teleport: vi.fn(),
    });
    const dinette = player("dinette");
    const bystander = player("bystander");
    dimension.getPlayers.mockReturnValue([dinette, bystander]);
    const waiting = vi
      .spyOn(SeatFillers.prototype, "waitingRiders")
      .mockReturnValue(new Map([[asPlayerId("dinette"), 2]]));
    const addRider = vi.fn().mockReturnValue(false);
    car.getComponent.mockImplementation((name: string) =>
      name === "minecraft:rideable" ? { addRider } : undefined,
    );
    world.seatStandingPlayers(asVehicleId("car"), {
      boxes: [{ min: { x: 0, y: 64, z: 0 }, max: { x: 3, y: 67, z: 3 } }],
      exit: { x: 5, y: 64, z: 2, yaw: 90 },
    });
    expect(addRider.mock.calls).toEqual([[bystander]]);
    expect(dinette.teleport).not.toHaveBeenCalled();
    expect(bystander.teleport).toHaveBeenCalledOnce();
    waiting.mockRestore();
  });

  it("seats only standing players inside any box nearest first and teleports overflow", () => {
    const { world, car, dimension } = fixture();
    car.location = { x: 0, y: 64, z: 0 };
    const player = (
      id: string,
      x: number,
      y: number,
      z: number,
      riding = false,
    ) => ({
      id,
      location: { x, y, z },
      getComponent: vi.fn(() => (riding ? {} : undefined)),
      teleport: vi.fn(),
    });
    const far = player("far", 2, 66, 1);
    const near = player("near", 0, 64, 0);
    const middle = player("middle", 0, 65, 1);
    const outside = player("outside", 3, 64, 0);
    const riding = player("riding", 0, 64, 0, true);
    const otherBox = player("otherBox", -2, 64, 0);
    dimension.getPlayers.mockReturnValue([
      far,
      outside,
      riding,
      middle,
      near,
      otherBox,
    ]);
    const addRider = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    car.getComponent.mockImplementation((name) =>
      name === "minecraft:rideable" ? { addRider } : undefined,
    );
    const departure = {
      boxes: [
        { min: { x: 0, y: 64, z: 0 }, max: { x: 3, y: 67, z: 3 } },
        { min: { x: -3, y: 64, z: 0 }, max: { x: 0, y: 67, z: 3 } },
      ],
      exit: { x: 5, y: 64, z: 2, yaw: 90 },
    };
    world.seatStandingPlayers(asVehicleId("missing"), departure);
    expect(dimension.getPlayers).not.toHaveBeenCalled();
    world.seatStandingPlayers(asVehicleId("car"), departure);
    expect(addRider.mock.calls).toEqual([[near], [middle], [otherBox], [far]]);
    for (const p of [near, middle, outside, riding])
      expect(p.teleport).not.toHaveBeenCalled();
    for (const p of [far, otherBox])
      expect(p.teleport).toHaveBeenCalledExactlyOnceWith(departure.exit, {
        rotation: { x: 0, y: 90 },
      });
    for (const p of [far, otherBox]) p.teleport.mockClear();
    world.seatStandingPlayers(asVehicleId("car"), { boxes: departure.boxes });
    for (const p of [far, otherBox]) expect(p.teleport).not.toHaveBeenCalled();
    car.getComponent.mockReturnValue(undefined);
    dimension.getPlayers.mockClear();
    world.seatStandingPlayers(asVehicleId("car"), departure);
    expect(dimension.getPlayers).not.toHaveBeenCalled();
  });
});

it("restores dock values and decor lazily from saved dynamic properties instead of entity properties", () => {
  vi.resetAllMocks();
  const docks = createDockBlocks(noCampSpace);
  const { world, car } = fixture(
    {
      camper: (vehicle) => readCamperRestored(vehicle, docks.restore(vehicle)),
    },
    docks,
  );
  car.typeId = ENTITY_TYPE.camper;
  const decor = '[{"slot":"table","item":"potted_plant"}]';
  car.getDynamicProperty.mockImplementation((key: string) => {
    if (key === DECK_CELLS_PROPERTY)
      return JSON.stringify([
        { x: 0, y: 64, z: 0, block: { type: "door", face: 2, open: true } },
      ]);
    if (key === DECOR_PROPERTY) return decor;
    return undefined;
  });
  const snapshot = world.loadedVehicles()[0];
  expect(car.getDynamicProperty).not.toHaveBeenCalledWith(DECK_CELLS_PROPERTY);
  expect(car.getDynamicProperty).not.toHaveBeenCalledWith(DECOR_PROPERTY);
  car.getDynamicProperty.mockClear();
  expect(snapshot?.restored()).toMatchObject({
    dockLaid: true,
    dockDoorOpen: true,
    dockDecor: decor,
  });
  expect(car.getDynamicProperty.mock.calls).toEqual([
    [DECK_CELLS_PROPERTY],
    [DECOR_PROPERTY],
  ]);
  const door = cellOf({ x: 0, y: 64, z: 0 });
  expect(
    world.ownsLaidBlock(asVehicleId(car.id), door, CAMPER_DOOR_BLOCK),
  ).toBe(true);
  expect(
    world.ownsLaidBlock(asVehicleId(car.id), door, "minecraft:stone"),
  ).toBe(false);
  expect(car.getProperty.mock.calls.flat()).not.toContain("yasu_ride:dockLaid");
});

describe("BedrockVehicleWorld with a missing vehicle", () => {
  beforeEach(() => vi.resetAllMocks());

  it("finds nothing solid and no ram targets around it", () => {
    const { world, dimension } = fixture();
    expect(world.solidAt(asVehicleId("missing"), { x: 0, y: 0, z: -1 })).toBe(
      false,
    );
    expect(world.targetsNear(asVehicleId("missing"))).toEqual([]);
    expect(dimension.getBlock).not.toHaveBeenCalled();
    expect(dimension.getEntities).not.toHaveBeenCalled();
  });

  it("keeps no deck seats for it", () => {
    const { world, dimension } = fixture();
    world.keepDeckSeats(asVehicleId("missing"), [{ x: 0, y: 64, z: 0 }], 0);
    expect(dimension.spawnEntity).not.toHaveBeenCalled();
  });
});

describe("BedrockVehicleWorld solid and ram queries around a loaded vehicle", () => {
  beforeEach(() => vi.resetAllMocks());

  function blockAt(y: number, above: { isAir: boolean; isLiquid: boolean }) {
    return {
      typeId: "minecraft:stone",
      isAir: false,
      isLiquid: false,
      location: { x: -2, y, z: 2 },
      above: () => above,
    };
  }

  it("counts a cell solid only when a downward ray stops on it (ADR 0035)", () => {
    fc.assert(
      fc.property(fc.boolean(), (rayHits) => {
        const { world, dimension } = fixture();
        dimension.getBlock.mockReturnValue(
          blockAt(63, { isAir: true, isLiquid: false }),
        );
        const getBlockFromRay = vi.fn(() =>
          rayHits ? { block: { location: { y: 63 } } } : undefined,
        );
        Object.assign(dimension, { getBlockFromRay });
        expect(world.solidAt(asVehicleId("car"), { x: -1, y: -1, z: 0 })).toBe(
          rayHits,
        );
        expect(getBlockFromRay).toHaveBeenCalledOnce();
      }),
    );
  });

  it("counts a cell under another block as solid without a ray", () => {
    const { world, dimension } = fixture();
    dimension.getBlock.mockReturnValue(
      blockAt(63, { isAir: false, isLiquid: false }),
    );
    const getBlockFromRay = vi.fn();
    Object.assign(dimension, { getBlockFromRay });
    expect(world.solidAt(asVehicleId("car"), { x: 0, y: -1, z: 0 })).toBe(true);
    expect(getBlockFromRay).not.toHaveBeenCalled();
  });

  it("lists the other entities near it with their offsets and whether they ride a vehicle", () => {
    const { world, entities, car } = fixture();
    const rider = {
      ...car,
      id: "zombie",
      typeId: "minecraft:zombie",
      families: [],
      location: { x: 0.75, y: 65.25, z: 0.75 },
      getComponent: vi.fn((name: string): unknown =>
        name === "minecraft:riding"
          ? { entityRidingOn: { typeId: ENTITY_TYPE.suv } }
          : undefined,
      ),
    };
    const walker = { ...rider, id: "pig", getComponent: vi.fn() };
    entities.push(rider, walker);
    expect(world.targetsNear(asVehicleId(car.id))).toEqual([
      { id: "zombie", offset: { x: 2, y: 1, z: -2 }, mount: "vehicle" },
      { id: "pig", offset: { x: 2, y: 1, z: -2 }, mount: undefined },
    ]);
  });

  it("does not move a vehicle that is not loaded", () => {
    const { world, car } = fixture();
    world.applyMotion(asVehicleId("missing"), { x: 0, y: 0, z: 1 }, 0);
    expect(car.applyImpulse).not.toHaveBeenCalled();
  });
});

describe("BedrockVehicleWorld dock owners (ADR 0068, 0093)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports the vehicle that laid a cell as its owner, and only a door as a door owner", () => {
    const { dimension, car, entities, world } = fixture();
    const other = { ...car, id: "other" };
    entities.push(other);
    Object.assign(dimension, { id: "overworld" });
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const floor = cellOf({ x: 0, y: 64, z: 0 });
    const door = cellOf({ x: 1, y: 64, z: 0 });
    world.loadedVehicles();
    const cells: DockCell<CamperRoomBlock>[] = [
      { ...floor, block: { type: "floor" } },
      {
        ...door,
        block: { type: "door", face: 0, open: false },
      },
    ];
    world.layDock(asVehicleId(car.id), cells);
    const here = asDimensionId("overworld");
    expect(world.dockCellOwner(here, floor)).toBe(car.id);
    expect(world.dockBlockOwner(here, floor, CAMPER_FLOOR_BLOCK)).toBe(car.id);
    expect(
      world.ownsLaidBlock(asVehicleId(car.id), floor, CAMPER_FLOOR_BLOCK),
    ).toBe(true);
    expect(
      world.ownsLaidBlock(asVehicleId(other.id), floor, CAMPER_FLOOR_BLOCK),
    ).toBe(false);
    expect(
      world.ownsLaidBlock(asVehicleId(car.id), floor, "other:camper_floor"),
    ).toBe(false);
    expect(
      world.ownsLaidBlock(asVehicleId("missing"), floor, CAMPER_FLOOR_BLOCK),
    ).toBe(false);
    expect(world.dockCellOwner(here, door)).toBe(car.id);
    expect(world.dockDoorOwner(here, floor)).toBeUndefined();
    expect(world.dockDoorOwner(here, door)).toBe(car.id);
    expect(world.dockCellOwner(here, { x: 2, y: 64, z: 0 })).toBeUndefined();
    expect(world.dockCellOwner(asDimensionId("nether"), floor)).toBeUndefined();
  });
});

describe("BedrockVehicleWorld.isVehicleSpace (ADR 0122)", () => {
  beforeEach(() => vi.resetAllMocks());
  const OVERWORLD = asDimensionId("overworld");

  // The car stands at (-1.25, 64.25, 2.75), in cell (-2, 64, 2). The SUV's footprint
  // reaches 3.12 blocks at any heading, and its clearance three blocks up.
  it.each<[Vec3, boolean]>([
    [{ x: -2, y: 64, z: 2 }, true],
    [{ x: -1, y: 66, z: 3 }, true],
    [{ x: -3, y: 65, z: 1 }, true],
    [{ x: 0, y: 64, z: 2 }, true],
    [{ x: -2, y: 64, z: 4 }, true],
    [{ x: -2, y: 64, z: 0 }, true],
    [{ x: 1, y: 64, z: 2 }, true],
    [{ x: 2, y: 64, z: 2 }, false],
    [{ x: 3, y: 64, z: 2 }, false],
    [{ x: -2, y: 64, z: 5 }, true],
    [{ x: -2, y: 64, z: 6 }, false],
    [{ x: -2, y: 64, z: 7 }, false],
    [{ x: -2, y: 67, z: 2 }, true],
    [{ x: -2, y: 68, z: 2 }, false],
    [{ x: -2, y: 63, z: 2 }, false],
  ])("treats %o as vehicle space: %s", (cell, expected) => {
    const { world } = fixture();
    expect(world.isVehicleSpace(OVERWORLD, cell)).toBe(expected);
  });

  // The scaled SUV extends over two blocks ahead and behind its center, so a
  // cell up to two cells ahead or behind, or to a side, overlaps it at some heading.
  it("treats every cell up to two cells from an SUV's cell along an axis as vehicle space", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.integer({ min: -2, max: 2 }),
        fc.boolean(),
        (x, z, step, alongX) => {
          const { world, car } = fixture();
          car.location = { x, y: 64, z };
          const cell = {
            x: Math.floor(x) + (alongX ? step : 0),
            y: 64,
            z: Math.floor(z) + (alongX ? 0 : step),
          };
          expect(world.isVehicleSpace(OVERWORLD, cell)).toBe(true);
        },
      ),
    );
  });

  it("leaves every cell five or more cells from an SUV's cell free", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.integer({ min: 5, max: 8 }),
        fc.constantFrom(-1, 1),
        fc.integer({ min: -6, max: 6 }),
        fc.boolean(),
        (x, z, gap, sign, across, alongX) => {
          const { world, car } = fixture();
          car.location = { x, y: 64, z };
          const away = sign * gap;
          const cell = {
            x: Math.floor(x) + (alongX ? away : across),
            y: 64,
            z: Math.floor(z) + (alongX ? across : away),
          };
          expect(world.isVehicleSpace(OVERWORLD, cell)).toBe(false);
        },
      ),
    );
  });

  it("treats a cell with a laid room block in it or under it as vehicle space", () => {
    const { world, entities } = fixture();
    entities.length = 0;
    const laid = { x: 10, y: 70, z: 10 };
    const owner = vi
      .spyOn(world, "dockCellOwner")
      .mockImplementation((_d, cell) =>
        cell.x === laid.x && cell.y === laid.y && cell.z === laid.z
          ? asVehicleId("car")
          : undefined,
      );
    expect(world.isVehicleSpace(OVERWORLD, laid)).toBe(true);
    expect(world.isVehicleSpace(OVERWORLD, { ...laid, y: 71 })).toBe(true);
    expect(world.isVehicleSpace(OVERWORLD, { ...laid, y: 72 })).toBe(false);
    owner.mockRestore();
  });

  it("is false in an unknown dimension", () => {
    const { world } = fixture();
    game.getDimension.mockImplementation(() => {
      throw new Error("unknown dimension");
    });
    expect(
      world.isVehicleSpace(asDimensionId("nowhere"), { x: 0, y: 0, z: 0 }),
    ).toBe(false);
  });

  it("ignores a vehicle-family entity of no known kind", () => {
    const { world, entities, car } = fixture();
    entities.length = 0;
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(world.isVehicleSpace(OVERWORLD, { x: -2, y: 64, z: 2 })).toBe(false);
  });
});

const noCampSpace: SpaceCheck = () => false;

it("sweeps drops from columns cut in the vehicle's dimension (ADR 0137)", () => {
  const { world, dimension } = fixture();
  const fillBlocks = vi.fn();
  Object.assign(dimension, { heightRange: { min: -64, max: 320 }, fillBlocks });
  dimension.getBlock.mockReturnValue({
    isAir: false,
    typeId: "minecraft:stone",
  });
  const columns = [{ x: 9, z: 9, bottom: 64, height: 1 }];
  world.cutColumns(asVehicleId("missing"), columns);
  expect(fillBlocks).not.toHaveBeenCalled();

  world.cutColumns(asVehicleId("car"), columns);
  expect(fillBlocks).toHaveBeenCalledOnce();
  const remove = vi.fn();
  const drop = {
    typeId: "minecraft:item",
    isValid: true,
    dimension,
    location: { x: 9, y: 64, z: 9 },
    remove,
  } as unknown as Entity;
  expect(world.sweepCutDrop(drop)).toBe(true);
  expect(remove).toHaveBeenCalledOnce();
});
it("paves in a vehicle's own dimension, and nothing for a missing vehicle (ADR 0181)", () => {
  const { world, dimension } = fixture();
  const pave = vi
    .spyOn(RoadPaver.prototype, "pave")
    .mockImplementation(() => {});
  const road = { block: "minecraft:stone", cells: [{ x: 9, y: 63, z: 9 }] };
  world.pave(asVehicleId("missing"), road);
  expect(pave).not.toHaveBeenCalled();
  world.pave(asVehicleId("car"), road);
  expect(pave).toHaveBeenCalledExactlyOnceWith(dimension, road);
  pave.mockRestore();
});
describe("standRiderAt", () => {
  const rotation = { x: 23, y: -72 };
  const standing = (missing?: "vehicle" | "player") => {
    const { world, car, dimension } = fixture();
    const player = {
      ...car,
      id: "rider",
      typeId: PLAYER_TYPE,
      getRotation: () => rotation,
      teleport: vi.fn(),
    };
    game.getEntity.mockImplementation((id: string) => {
      if (id === car.id && missing !== "vehicle") return car;
      if (id === player.id && missing !== "player") return player;
      return undefined;
    });
    dimension.getBlock.mockImplementation(({ y }: Vec3) =>
      y < 64
        ? { isAir: false, isLiquid: false, typeId: "minecraft:stone" }
        : { isAir: true, isLiquid: false, typeId: "minecraft:air" },
    );
    const at = { x: 0.5, y: 64.25, z: 2 };
    world.standRiderAt(asVehicleId(car.id), asPlayerId(player.id), at);
    return { player, at };
  };

  it("teleports a present rider to the exit on open ground, keeping their view", () => {
    const { player, at } = standing();
    expect(player.teleport).toHaveBeenCalledExactlyOnceWith(at, { rotation });
  });

  it.each(["vehicle", "player"] as const)(
    "leaves the rider where they are when the %s is missing",
    (missing) => {
      expect(standing(missing).player.teleport).not.toHaveBeenCalled();
    },
  );
});

it("reads a loaded host without running the drive scan or changing entities", () => {
  const { world, car, index } = fixture();
  seatIdlePlayer(car, () => undefined);
  index.track(car as unknown as Entity);
  game.getEntity.mockClear();
  expect(world.hostState(car.id)).toEqual({
    status: "present",
    dimensionId: "minecraft:overworld",
    location: car.location,
    yaw: 0,
    mount: profileOf("suv").roofTent,
    driverPresent: true,
    moving: false,
  });
  expect(game.getEntity).not.toHaveBeenCalled();
  expect(car.teleport).not.toHaveBeenCalled();
  expect(car.setProperty).not.toHaveBeenCalled();
  expect(car.setDynamicProperty).not.toHaveBeenCalled();
  expect(car.applyImpulse).not.toHaveBeenCalled();
});

it("reports unknown for missing, invalid and non-vehicle hosts", () => {
  const { world, car } = fixture();
  expect(world.hostState("missing")).toEqual({ status: "unknown" });
  car.isValid = false;
  expect(world.hostState(car.id)).toEqual({ status: "unknown" });
  game.getEntity.mockReturnValue({ isValid: true, typeId: "minecraft:pig" });
  expect(world.hostState("pig")).toEqual({ status: "unknown" });
});
