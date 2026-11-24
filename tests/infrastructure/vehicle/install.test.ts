import {
  type Dimension,
  type ItemUseAfterEvent,
  type Player,
  type PlayerInteractWithBlockBeforeEvent,
  system,
  world,
} from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { STARTER_KINDS } from "../../../src/domain/vehicle/placement/starter";
import { HEADLIGHT_SWITCH_TYPE } from "../../../src/infrastructure/shared/identifiers";
import {
  ITEM_TYPE,
  STARTER_RECEIVED_PROPERTY,
} from "../../../src/infrastructure/vehicle/bedrock/identifiers";
import { installVehicles } from "../../../src/infrastructure/vehicle/install";

vi.mock("@minecraft/server", () => {
  const unusedEvent = { subscribe: vi.fn() };
  return {
    Direction: { Up: "Up" },
    EntityInitializationCause: { Loaded: "Loaded" },
    BlockVolume: class {},
    GameMode: { Creative: "Creative" },
    ItemStack: class {
      constructor(
        readonly typeId: string,
        readonly amount: number,
      ) {}
    },
    InputMode: { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" },
    world: {
      getEntity: vi.fn(),
      getDimension: vi.fn(),
      beforeEvents: {
        playerInteractWithBlock: { subscribe: vi.fn() },
        playerBreakBlock: unusedEvent,
        playerInteractWithEntity: unusedEvent,
        entityRemove: unusedEvent,
      },
      afterEvents: {
        entitySpawn: unusedEvent,
        entityLoad: unusedEvent,
        entityDie: unusedEvent,
        entityHitEntity: unusedEvent,
        itemUse: { subscribe: vi.fn() },
        playerSpawn: { subscribe: vi.fn() },
      },
    },
    system: {
      currentTick: 1,
      run: vi.fn(),
      runInterval: vi.fn(),
      beforeEvents: { startup: unusedEvent },
      afterEvents: { scriptEventReceive: unusedEvent },
    },
  };
});

beforeEach(() => vi.resetAllMocks());

it("grants Creative players each missing starter vehicle once across joins", () => {
  installVehicles({ isCampSpace: () => false, laterSwitchTargets: () => [] });
  fc.assert(
    fc.property(fc.subarray([...STARTER_KINDS]), (received) => {
      const flags = new Map(
        received.map((kind) => [STARTER_RECEIVED_PROPERTY[kind], true]),
      );
      const addItem = vi.fn();
      const player = {
        id: "p",
        typeId: "minecraft:player",
        isValid: true,
        getGameMode: () => "Creative",
        getComponent: () => ({ container: { addItem } }),
        getDynamicProperty: (key: string) => flags.get(key),
        setDynamicProperty: (key: string, value: boolean) =>
          flags.set(key, value),
      } as unknown as Player;
      vi.mocked(world.getEntity).mockReturnValue(player);
      const spawn = (initialSpawn: boolean) => {
        for (const [onSpawn] of vi.mocked(
          world.afterEvents.playerSpawn.subscribe,
        ).mock.calls)
          onSpawn({ player, initialSpawn });
      };
      spawn(false);
      expect(addItem).not.toHaveBeenCalled();
      spawn(true);
      spawn(true);
      expect(addItem.mock.calls).toEqual(
        STARTER_KINDS.filter((kind) => !received.includes(kind)).map((kind) => [
          { typeId: ITEM_TYPE[kind], amount: 1 },
        ]),
      );
      for (const kind of STARTER_KINDS)
        expect(flags.get(STARTER_RECEIVED_PROPERTY[kind])).toBe(true);
    }),
  );
});

it("returns the vehicles' space check for other features (ADR 0122)", () => {
  const { isVehicleSpace, vehicleHost } = installVehicles({
    isCampSpace: () => false,
    laterSwitchTargets: () => [],
  });
  expect(vehicleHost("missing")).toEqual({ status: "unknown" });
  // No vehicle is loaded and no room block is laid, so no cell is vehicle space.
  expect(
    isVehicleSpace(asDimensionId("overworld"), cellOf({ x: 0, y: 64, z: 0 })),
  ).toBe(false);
});

it("routes a switch press to the next feature when no vehicle owns the player's cell", () => {
  const switchFor = vi.fn();
  installVehicles({
    isCampSpace: () => false,
    laterSwitchTargets: () => [
      {
        claimsItemUse: () => true,
        claimsBlockPress: () => false,
        claimsEntityPress: () => false,
        switchFor,
      },
    ],
  });
  const event = {
    itemStack: { typeId: HEADLIGHT_SWITCH_TYPE },
    source: {
      id: "p",
      isValid: true,
      dimension: { id: "overworld" },
      location: { x: 0, y: 64, z: 0 },
      getComponent: () => undefined,
    },
  } as unknown as ItemUseAfterEvent;
  for (const [use] of vi.mocked(world.afterEvents.itemUse.subscribe).mock.calls)
    use(event);
  expect(switchFor).toHaveBeenCalledExactlyOnceWith(event.source);
});

it.each([true, false])(
  "places the SUV only outside camp space (camp occupied: %s, ADR 0129)",
  (occupied) => {
    const isCampSpace = vi.fn(() => occupied);
    const spawnEntity = vi.fn(() => ({
      id: "suv",
      setRotation: vi.fn(),
      setDynamicProperty: vi.fn(),
    }));
    const dimension = {
      id: "overworld",
      getBlock: () => ({ isAir: true }),
      spawnEntity,
    } as unknown as Dimension;
    const player = {
      id: "p",
      typeId: "minecraft:player",
      isValid: true,
      getRotation: () => ({ y: 0 }),
      selectedSlotIndex: 0,
      getGameMode: () => "Creative",
      getDynamicProperty: () => true,
    } as unknown as Player;
    vi.mocked(world.getDimension).mockReturnValue(dimension);
    vi.mocked(world.getEntity).mockReturnValue(player);
    installVehicles({ isCampSpace, laterSwitchTargets: () => [] });
    vi.mocked(system.run).mockClear();
    const event = {
      player,
      isFirstEvent: true,
      itemStack: { typeId: ITEM_TYPE.suv },
      blockFace: "Up",
      block: {
        typeId: "minecraft:stone",
        dimension,
        location: { x: 0, y: 64, z: 0 },
      },
    } as PlayerInteractWithBlockBeforeEvent;
    for (const [onInteract] of vi.mocked(
      world.beforeEvents.playerInteractWithBlock.subscribe,
    ).mock.calls)
      onInteract(event);
    for (const [nextTick] of vi.mocked(system.run).mock.calls) nextTick();
    expect(isCampSpace).toHaveBeenCalledWith(
      asDimensionId("overworld"),
      expect.objectContaining({ y: 65 }),
    );
    expect(spawnEntity).toHaveBeenCalledTimes(occupied ? 0 : 1);
  },
);
