import type {
  Block,
  Entity,
  ItemUseAfterEvent,
  Player,
  PlayerInteractWithBlockBeforeEvent,
  PlayerInteractWithEntityBeforeEvent,
} from "@minecraft/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitchLantern } from "../../../src/application/camp/switchLantern";
import { asTentId, type TentId } from "../../../src/domain/camp/tent";
import type { DimensionId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";
import { lanternSwitchTarget } from "../../../src/infrastructure/camp/bedrock/lanternSwitch";
import { LOW_CHAIR_TYPE } from "../../../src/infrastructure/camp/identifiers";
import { HEADLIGHT_SWITCH_TYPE } from "../../../src/infrastructure/shared/identifiers";
import {
  registerSwitchRouter,
  type SwitchTarget,
} from "../../../src/infrastructure/shared/switchRouter";
import { defined } from "../../support/defined";

const game = vi.hoisted(() => ({
  use: vi.fn<(handler: (ev: ItemUseAfterEvent) => void) => void>(),
  entity:
    vi.fn<
      (handler: (ev: PlayerInteractWithEntityBeforeEvent) => void) => void
    >(),
  block:
    vi.fn<
      (handler: (ev: PlayerInteractWithBlockBeforeEvent) => void) => void
    >(),
  run: vi.fn<(callback: () => void) => void>(),
  currentTick: 42,
}));
vi.mock("@minecraft/server", () => ({
  world: {
    afterEvents: { itemUse: { subscribe: game.use } },
    beforeEvents: {
      playerInteractWithEntity: { subscribe: game.entity },
      playerInteractWithBlock: { subscribe: game.block },
    },
  },
  system: {
    run: game.run,
    get currentTick() {
      return game.currentTick;
    },
  },
}));

const TENT = asTentId("-7");
const INSIDE = { x: 0.5, y: 64, z: 0.5 };
const OUTSIDE = { x: 50.5, y: 64, z: 50.5 };
const BLOCK = { typeId: "yasu_ride:tent_wall" } as unknown as Block;

function player(
  over: { isValid?: boolean; at?: Vec3; mount?: string } = {},
): Player {
  return {
    isValid: over.isValid ?? true,
    location: over.at ?? INSIDE,
    dimension: { id: "minecraft:overworld" },
    getComponent: (name: string) =>
      name === "minecraft:riding" && over.mount !== undefined
        ? { entityRidingOn: { typeId: over.mount } }
        : undefined,
  } as unknown as Player;
}

function fixture() {
  const execute = vi.fn(() => true);
  const tentContaining = vi.fn(
    (_d: DimensionId, feet: Vec3): TentId | undefined =>
      feet.x < 10 ? TENT : undefined,
  );
  const target = lanternSwitchTarget(
    { execute } as unknown as SwitchLantern,
    tentContaining,
  );
  return { execute, tentContaining, target };
}

describe("lanternSwitchTarget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("has exactly the four SwitchTarget members", () => {
    expect(Object.keys(fixture().target).sort()).toEqual([
      "claimsBlockPress",
      "claimsEntityPress",
      "claimsItemUse",
      "switchFor",
    ]);
  });

  it("claims a use and any block press inside a tent on foot or on a Low Chair", () => {
    const { target, tentContaining } = fixture();
    for (const p of [player(), player({ mount: LOW_CHAIR_TYPE })]) {
      expect(target.claimsItemUse(p)).toBe(true);
      expect(target.claimsBlockPress(p, BLOCK)).toBe(true);
    }
    expect(tentContaining).toHaveBeenCalledWith("minecraft:overworld", INSIDE);
  });

  it("claims nothing for another rider, a player outside, or an invalid player", () => {
    const { target } = fixture();
    for (const p of [
      player({ mount: "yasu_ride:suv" }),
      player({ mount: "yasu_ride:camper" }),
      player({ mount: "minecraft:horse" }),
      player({ at: OUTSIDE }),
      player({ isValid: false }),
    ]) {
      expect(target.claimsItemUse(p)).toBe(false);
      expect(target.claimsBlockPress(p, BLOCK)).toBe(false);
    }
  });

  it("never claims an entity press", () => {
    const { target } = fixture();
    const chair = { typeId: LOW_CHAIR_TYPE } as unknown as Entity;
    for (const p of [
      player(),
      player({ mount: LOW_CHAIR_TYPE }),
      player({ at: OUTSIDE }),
    ])
      expect(target.claimsEntityPress(p, chair)).toBe(false);
  });

  it("switches the tent the player is in at the current tick, and nothing once they left", () => {
    const { target, execute } = fixture();
    target.switchFor(player());
    expect(execute).toHaveBeenCalledExactlyOnceWith({ tentId: TENT, tick: 42 });
    target.switchFor(player({ at: OUTSIDE }));
    target.switchFor(player({ isValid: false }));
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe("the switch router with the vehicle target first", () => {
  beforeEach(() => vi.clearAllMocks());

  function routed(vehicleClaims: boolean) {
    const { target, execute } = fixture();
    const vehicle = {
      claimsItemUse: vi.fn(() => vehicleClaims),
      claimsBlockPress: vi.fn(() => vehicleClaims),
      claimsEntityPress: vi.fn(() => vehicleClaims),
      switchFor: vi.fn(),
    } satisfies SwitchTarget;
    registerSwitchRouter({ [HEADLIGHT_SWITCH_TYPE]: () => [vehicle, target] });
    return {
      vehicle,
      execute,
      use: defined(game.use.mock.calls[0]?.[0], "itemUse"),
      entity: defined(game.entity.mock.calls[0]?.[0], "entity"),
      block: defined(game.block.mock.calls[0]?.[0], "block"),
    };
  }
  const item = { typeId: HEADLIGHT_SWITCH_TYPE };
  const blockPress = (p: Player, isFirstEvent: boolean) =>
    ({
      player: p,
      block: BLOCK,
      itemStack: item,
      isFirstEvent,
      cancel: false,
    }) as unknown as PlayerInteractWithBlockBeforeEvent;
  const runQueued = () => {
    for (const [callback] of game.run.mock.calls) callback();
  };

  it("gives a rider the vehicle's switch only", () => {
    const { vehicle, execute, use, block } = routed(true);
    const rider = player({ mount: "yasu_ride:suv" });
    use({ source: rider, itemStack: item } as unknown as ItemUseAfterEvent);
    block(blockPress(rider, true));
    runQueued();
    expect(vehicle.switchFor).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
  });

  it("switches the lantern once for a long press on foot, and cancels every repeat", () => {
    const { vehicle, execute, block } = routed(false);
    const p = player();
    const presses = [true, false, false].map((first) => blockPress(p, first));
    for (const ev of presses) block(ev);
    runQueued();
    expect(presses.map((ev) => ev.cancel)).toEqual([true, true, true]);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ tentId: TENT, tick: 42 });
    expect(vehicle.switchFor).not.toHaveBeenCalled();
  });

  it("leaves a player outside alone", () => {
    const { vehicle, execute, use, block } = routed(false);
    const p = player({ at: OUTSIDE });
    const ev = blockPress(p, true);
    block(ev);
    use({ source: p, itemStack: item } as unknown as ItemUseAfterEvent);
    runQueued();
    expect(ev.cancel).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(vehicle.switchFor).not.toHaveBeenCalled();
  });

  it("keeps an entity press inside a tent", () => {
    const { execute, entity } = routed(false);
    const ev = {
      player: player(),
      target: { typeId: LOW_CHAIR_TYPE },
      itemStack: item,
      cancel: false,
    } as unknown as PlayerInteractWithEntityBeforeEvent;
    entity(ev);
    runQueued();
    expect(ev.cancel).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
});
