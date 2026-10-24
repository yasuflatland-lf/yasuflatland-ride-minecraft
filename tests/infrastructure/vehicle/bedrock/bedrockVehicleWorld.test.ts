import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../../../src/application/shared/ports/space";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../../src/domain/shared/ids";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import type { Departure } from "../../../../src/domain/vehicle/dock/dock";
import type { EngineCommand } from "../../../../src/domain/vehicle/drive";
import type { RawInput } from "../../../../src/domain/vehicle/driveInput";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import { BedrockInventory } from "../../../../src/infrastructure/vehicle/bedrock/bedrockInventory";
import { BedrockPaintWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPaintWorld";
import { BedrockPlacementWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockPlacementWorld";
import { BedrockVehicleWorld } from "../../../../src/infrastructure/vehicle/bedrock/bedrockVehicleWorld";
import { BladeCuts } from "../../../../src/infrastructure/vehicle/bedrock/bladeCuts";
import { DockBlocks } from "../../../../src/infrastructure/vehicle/bedrock/dockBlocks";
import { EntityIndex } from "../../../../src/infrastructure/vehicle/bedrock/entityIndex";
import {
  CAMPER_FLOOR_BLOCK,
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
  DECOR_PROPERTY,
  ENTITY_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  OWNER_PROPERTY,
  PLAYER_TYPE,
  SEAT_FILLER_TYPE,
  VEHICLE_FAMILY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";
import { blockGrid } from "../../../support/blockGrid";

const game = vi.hoisted(() => ({
  getDimension: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: game,
  system: {},
  BlockVolume: class {},
  GameMode: { Creative: "Creative", Survival: "Survival" },
  ButtonState: {},
  InputButton: {},
  EntityDamageCause: {},
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number>) => ({
      typeId,
      states,
    }),
  },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));

function fixture() {
  const dimension = {
    getBlock: vi.fn(),
    getPlayers: vi.fn(),
    getEntities: vi.fn(),
    spawnItem: vi.fn(),
    spawnEntity: vi.fn(),
    playSound: vi.fn(),
  };
  const car = {
    id: "car",
    typeId: ENTITY_TYPE.suv,
    families: [VEHICLE_FAMILY],
    isValid: true,
    location: { x: -1.25, y: 64.25, z: 2.75 },
    dimension,
    isOnGround: false,
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: vi.fn((_key: string): unknown => undefined),
    getComponent: vi.fn((_name: string): unknown => undefined),
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    teleport: vi.fn(),
    clearVelocity: vi.fn(),
    applyImpulse: vi.fn(),
    setRotation: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    playAnimation: vi.fn(),
    setProperty: vi.fn(),
  };
  const entities = [car];
  dimension.getEntities.mockImplementation(
    (query: { type?: string; families?: string[] } = {}) =>
      entities.filter(
        (e) =>
          (query.type === undefined || e.typeId === query.type) &&
          (query.families === undefined ||
            query.families.every((family) => e.families.includes(family))),
      ),
  );
  game.getDimension.mockImplementation((id: string) =>
    id === "overworld" ? dimension : { getEntities: () => [] },
  );
  game.getEntity.mockImplementation((id: string) =>
    id === car.id ? car : undefined,
  );
  const inputs = new VehicleTestStore<RawInput>();
  const index = new EntityIndex();
  const inventory = new BedrockInventory(index);
  return {
    index,
    inventory,
    placement: new BedrockPlacementWorld(inventory, index, noCampSpace),
    paint: new BedrockPaintWorld(index, inventory),
    inputs,
    entities,
    dimension,
    car,
    world: new BedrockVehicleWorld(index, inputs, noCampSpace),
  };
}

describe("BedrockPlacementWorld (ADR 0066)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(VEHICLE_KINDS)(
    "records the owner synchronously when spawning a %s",
    (kind) => {
      const { dimension, car, placement } = fixture();
      dimension.spawnEntity.mockReturnValue(car);
      const ownerId = asPlayerId("placing-player");
      expect(
        placement.spawnVehicle(
          asDimensionId("overworld"),
          car.location,
          45,
          kind,
          ownerId,
        ),
      ).toBe(car.id);
      expect(dimension.spawnEntity).toHaveBeenCalledExactlyOnceWith(
        ENTITY_TYPE[kind],
        car.location,
      );
      expect(car.setRotation).toHaveBeenCalledExactlyOnceWith({ x: 0, y: 45 });
      expect(car.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
        OWNER_PROPERTY,
        ownerId,
      );
      expect(OWNER_PROPERTY).toBe("yasu_ride:owner");
    },
  );
});

describe("BedrockPlacementWorld water query (ADR 0051)", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:bubble_column",
  ])(
    "counts %s in the named dimension as water at the floored cell",
    (typeId) => {
      const { dimension, placement } = fixture();
      dimension.getBlock.mockReturnValue({ typeId, isWaterlogged: false });
      expect(
        placement.isWaterAt(asDimensionId("overworld"), {
          x: 1.7,
          y: 64.2,
          z: -0.5,
        }),
      ).toBe(true);
      expect(game.getDimension).toHaveBeenCalledWith("overworld");
      expect(dimension.getBlock).toHaveBeenCalledWith({ x: 1, y: 64, z: -1 });
    },
  );

  it("counts a waterlogged block as water and air or an unloaded cell as dry", () => {
    const { dimension, placement } = fixture();
    dimension.getBlock.mockReturnValueOnce({
      typeId: "minecraft:kelp",
      isWaterlogged: true,
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(true);
    dimension.getBlock.mockReturnValueOnce({
      typeId: "minecraft:air",
      isWaterlogged: false,
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
    dimension.getBlock.mockImplementationOnce(() => {
      throw new Error("unloaded");
    });
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
    dimension.getBlock.mockReturnValueOnce(undefined);
    expect(
      placement.isWaterAt(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
    ).toBe(false);
  });

  it("is dry in an unknown dimension", () => {
    const { placement } = fixture();
    game.getDimension.mockImplementation(() => {
      throw new Error("unknown");
    });
    expect(
      placement.isWaterAt(asDimensionId("nowhere"), { x: 0, y: 0, z: 0 }),
    ).toBe(false);
  });
});

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

  it("skips an unknown entity in the vehicle family in snapshots and fleet entries", () => {
    const { entities, car, world } = fixture();
    entities.push({ ...car, id: "unknown", typeId: "yasu_ride:unknown" });
    expect(
      world.loadedVehicles().map((s) => ({ id: s.id, kind: s.kind })),
    ).toEqual([{ id: car.id, kind: "suv" }]);
  });

  it("gives the item of the requested kind", () => {
    for (const kind of VEHICLE_KINDS) {
      const { inventory } = fixture();
      const playerId = asPlayerId("player");
      const addItem = vi.fn();
      const player = {
        id: playerId,
        typeId: PLAYER_TYPE,
        getComponent: (name: string) =>
          name === "minecraft:inventory"
            ? { container: { addItem } }
            : undefined,
      };
      game.getEntity.mockImplementation((id: string) =>
        id === playerId ? player : undefined,
      );

      inventory.giveVehicleItem(playerId, kind);

      expect(addItem).toHaveBeenCalledWith(
        expect.objectContaining({ typeId: ITEM_TYPE[kind], amount: 1 }),
      );
    }
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
    world.loadedVehicles();
    dimension.getEntities.mockReturnValue([car]);
    expect(world.loadedVehicles()[0]?.testInput).toBeUndefined();
  });

  it("clears the headlight blocks of a vehicle once it is no longer loaded (ADR 0020, 0038)", () => {
    const { dimension, car, world } = fixture();
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const cell = { x: 0, y: 65, z: 4, level: 15 };
    world.loadedVehicles();
    world.shineHeadlights(asVehicleId(car.id), [cell]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:light_block_15");
    dimension.getEntities.mockReturnValue([]);
    world.loadedVehicles();
    expect(grid.typeAt(cell)).toBe("minecraft:air");
  });
});

describe("BedrockPaintWorld paint wiring (ADR 0076)", () => {
  it.each(VEHICLE_KINDS)("reports the kind of a %s entity", (kind) => {
    const { car, paint } = fixture();
    car.typeId = ENTITY_TYPE[kind];
    expect(paint.kindOf(asVehicleId(car.id))).toBe(kind);
  });

  it("an unknown type has no kind", () => {
    const { car, paint } = fixture();
    car.typeId = "yasu_ride:unknown";
    expect(paint.kindOf(asVehicleId(car.id))).toBeUndefined();
  });

  it("a missing or invalid vehicle has no kind", () => {
    const { car, paint } = fixture();
    expect(paint.kindOf(asVehicleId("missing"))).toBeUndefined();
    car.isValid = false;
    expect(paint.kindOf(asVehicleId(car.id))).toBeUndefined();
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
  { kind: "suv", name: "form", value: "hover" },
  { kind: "sportsboat", name: "docked", value: true },
] as const)(
  "reads only $kind's declared restored properties, lazily",
  ({ kind, name, value }) => {
    vi.resetAllMocks();
    const { world, car } = fixture();
    car.typeId = ENTITY_TYPE[kind];
    const stored: Record<string, unknown> = {
      [`${NAMESPACE}:form`]: "hover",
      [`${NAMESPACE}:docked`]: true,
    };
    car.getProperty.mockImplementation((key) => stored[key] ?? false);
    const snapshot = world.loadedVehicles()[0];
    expect(car.getProperty.mock.calls).toEqual([[HEADLIGHTS_PROPERTY]]);
    car.getProperty.mockClear();
    expect(snapshot?.restored()).toStrictEqual({
      [name]: value,
      dockLaid: false,
      dockDoorOpen: undefined,
      dockDecor: undefined,
    });
    expect(car.getProperty.mock.calls).toEqual([[`${NAMESPACE}:${name}`]]);
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
      x: 0,
      y: 64,
      z: 3,
      block: { type: "deck" as const, height: 9 },
    };
    const pose = { x: 1, y: 64.5, z: -2, yaw: 30 };
    world.loadedVehicles();
    world.holdAt(asVehicleId(car.id), pose);
    world.layDock(asVehicleId(car.id), [cell]);
    dimension.getEntities.mockReturnValue([]);
    world.loadedVehicles();
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
      x: 0,
      y: 64,
      z: 3,
      block: { type: "deck" as const, height: 9 },
    };
    const light = { x: 0, y: 65, z: 4, level: 15 };
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
      x,
      y: 64,
      z: 0,
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
  const { world, car } = fixture();
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

type Fixture = ReturnType<typeof fixture>;
const creativeAdapters: [
  string,
  (f: Fixture) => { isCreative(id: string): boolean },
][] = [
  ["BedrockPlacementWorld", (f) => f.placement],
  ["BedrockPaintWorld", (f) => new BedrockPaintWorld(f.index, f.inventory)],
];

describe.each(creativeAdapters)("%s isCreative", (_name, adapterOf) => {
  beforeEach(() => vi.resetAllMocks());
  const player = (mode: string, isValid = true) => ({
    id: "p",
    typeId: PLAYER_TYPE,
    isValid,
    getGameMode: vi.fn(() => mode),
  });
  it("is true for a valid player in creative", () => {
    const f = fixture();
    game.getEntity.mockImplementation(() => player("Creative"));
    expect(adapterOf(f).isCreative("p")).toBe(true);
  });
  it("is false for a player in survival", () => {
    const f = fixture();
    game.getEntity.mockImplementation(() => player("Survival"));
    expect(adapterOf(f).isCreative("p")).toBe(false);
  });
  it("is false for a missing entity", () => {
    const f = fixture();
    game.getEntity.mockImplementation(() => undefined);
    expect(adapterOf(f).isCreative("p")).toBe(false);
  });
  it("is false for an entity that is not a player", () => {
    const f = fixture();
    game.getEntity.mockImplementation(() => ({
      id: "p",
      typeId: ENTITY_TYPE.suv,
      isValid: true,
      getGameMode: vi.fn(() => "Creative"),
    }));
    expect(adapterOf(f).isCreative("p")).toBe(false);
  });
  it("is false without asking the game mode for a player who has left", () => {
    const f = fixture();
    const left = player("Creative", false);
    game.getEntity.mockImplementation(() => left);
    expect(adapterOf(f).isCreative("p")).toBe(false);
    expect(left.getGameMode).not.toHaveBeenCalled();
  });
});

it("answers each dock owner query from the room blocks it laid (ADR 0068, 0093)", () => {
  const f = fixture();
  const here = asDimensionId("overworld");
  const cell = { x: 1, y: 64, z: 2 };
  const owners = [
    ["doorOwner", "dockDoorOwner", "door"],
    ["cellOwner", "dockCellOwner", "cell"],
  ] as const;
  for (const [dock, query, owner] of owners) {
    const spy = vi
      .spyOn(DockBlocks.prototype, dock)
      .mockReturnValue(asVehicleId(owner));
    expect(f.world[query](here, cell)).toBe(asVehicleId(owner));
    expect(spy).toHaveBeenCalledExactlyOnceWith(here, cell);
    spy.mockRestore();
  }
});

it("answers dockBlockOwner from the blocks DockBlocks laid (ADR 0096)", () => {
  const f = fixture();
  const here = asDimensionId("overworld");
  const cell = { x: 1, y: 64, z: 2 };
  const spy = vi
    .spyOn(DockBlocks.prototype, "laidBlockOwner")
    .mockReturnValue(asVehicleId("camper"));
  expect(f.world.dockBlockOwner(here, cell, CAMPER_FLOOR_BLOCK)).toBe(
    asVehicleId("camper"),
  );
  expect(spy).toHaveBeenCalledExactlyOnceWith(here, cell, CAMPER_FLOOR_BLOCK);
  spy.mockRestore();
});

describe("BedrockVehicleWorld dock owners (ADR 0068, 0093)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reports the vehicle that laid a cell as its owner, and only a door as a door owner", () => {
    const { dimension, car, world } = fixture();
    Object.assign(dimension, { id: "overworld" });
    const grid = blockGrid();
    dimension.getBlock.mockImplementation(grid.getBlock);
    const floor = { x: 0, y: 64, z: 0 };
    const door = { x: 1, y: 64, z: 0 };
    world.loadedVehicles();
    world.layDock(asVehicleId(car.id), [
      { ...floor, block: { type: "floor" } },
      { ...door, block: { type: "door", face: 0, open: false } },
    ]);
    const here = asDimensionId("overworld");
    expect(world.dockCellOwner(here, floor)).toBe(car.id);
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
  // reaches 2.35 blocks at any heading, and its clearance two blocks up.
  it.each<[Vec3, boolean]>([
    [{ x: -2, y: 64, z: 2 }, true],
    [{ x: -1, y: 66, z: 3 }, true],
    [{ x: -3, y: 65, z: 1 }, true],
    [{ x: 0, y: 64, z: 2 }, true],
    [{ x: -2, y: 64, z: 4 }, true],
    [{ x: -2, y: 64, z: 0 }, true],
    [{ x: 2, y: 64, z: 2 }, false],
    [{ x: -2, y: 64, z: 6 }, false],
    [{ x: -2, y: 67, z: 2 }, false],
    [{ x: -2, y: 63, z: 2 }, false],
  ])("treats %o as vehicle space: %s", (cell, expected) => {
    const { world } = fixture();
    expect(world.isVehicleSpace(OVERWORLD, cell)).toBe(expected);
  });

  // The SUV's body reaches 1.85 ahead and 2.22 behind its center (suv.geo.json), so a
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

  it("leaves every cell four or more cells from an SUV's cell free", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.integer({ min: 4, max: 7 }),
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

it("cuts a vehicle's columns in its own dimension, and nothing for a missing vehicle (ADR 0137)", () => {
  const { world, dimension } = fixture();
  const cut = vi.spyOn(BladeCuts.prototype, "cut").mockImplementation(() => {});
  const columns = [{ x: 9, z: 9, bottom: 64 }];
  world.cutColumns(asVehicleId("missing"), columns);
  expect(cut).not.toHaveBeenCalled();
  world.cutColumns(asVehicleId("car"), columns);
  expect(cut).toHaveBeenCalledExactlyOnceWith(dimension, columns);
  cut.mockRestore();
});
it.each([false, true])(
  "returns the blade cut drop sweep result: %s",
  (result) => {
    const { world } = fixture();
    const entity = {} as Entity;
    const sweep = vi
      .spyOn(BladeCuts.prototype, "sweepDrop")
      .mockReturnValue(result);
    expect(world.sweepCutDrop(entity)).toBe(result);
    expect(sweep).toHaveBeenCalledWith(entity);
    sweep.mockRestore();
  },
);
