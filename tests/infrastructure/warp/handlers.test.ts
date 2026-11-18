import type {
  BlockCustomComponent,
  CustomComponentParameters,
  ItemUseBeforeEvent,
  PlayerBreakBlockAfterEvent,
  PlayerInteractWithBlockBeforeEvent,
  PlayerPlaceBlockAfterEvent,
} from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { registerWarpBlockInteract } from "../../../src/infrastructure/warp/handlers/blockInteract";
import { WarpFormGuard } from "../../../src/infrastructure/warp/handlers/formGuard";
import { registerWarpPlacement } from "../../../src/infrastructure/warp/handlers/placement";
import { registerWarpRemoval } from "../../../src/infrastructure/warp/handlers/removal";
import { registerWarpTool } from "../../../src/infrastructure/warp/handlers/tool";
import {
  WARP_BLOCK_COMPONENT,
  WARP_BLOCK_TYPE,
  WARP_TOOL_TYPE,
} from "../../../src/infrastructure/warp/identifiers";

import { installWarp } from "../../../src/infrastructure/warp/install";

vi.mock("@minecraft/server-ui", () => ({
  ModalFormData: vi.fn(),
  ActionFormData: vi.fn(),
  FormCancelationReason: { UserBusy: "UserBusy" },
}));

const game = vi.hoisted(() => ({
  hitBlock: vi.fn(),
  beforeBreak: vi.fn(),
  leave: vi.fn(),
  getDynamicProperty: vi.fn(),
  place: vi.fn(),
  break: vi.fn(),
  startup: vi.fn(),
  use: vi.fn(),
  interact: vi.fn(),
  run: vi.fn(),
  currentTick: 0,
}));
vi.mock("@minecraft/server", () => ({
  system: {
    beforeEvents: { startup: { subscribe: game.startup } },
    run: game.run,
    get currentTick() {
      return game.currentTick;
    },
  },
  world: {
    getDynamicProperty: game.getDynamicProperty,
    afterEvents: {
      entityHitBlock: { subscribe: game.hitBlock },
      playerLeave: { subscribe: game.leave },
      playerPlaceBlock: { subscribe: game.place },
      playerBreakBlock: { subscribe: game.break },
    },
    beforeEvents: {
      playerBreakBlock: { subscribe: game.beforeBreak },
      itemUse: { subscribe: game.use },
      playerInteractWithBlock: { subscribe: game.interact },
    },
  },
  GameMode: { Creative: "Creative" },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  game.currentTick = 0;
});
const flush = async () => {
  for (let n = 0; n < 5; n++) await Promise.resolve();
};
function fixture() {
  const addItem = vi.fn();
  const dimension = { id: "minecraft:overworld", spawnItem: vi.fn() };
  const player = {
    id: "player",
    isValid: true,
    isSneaking: false,
    dimension,
    location: { x: 1, y: 2, z: 3 },
    getGameMode: vi.fn(() => "Survival"),
    getComponent: vi.fn(() => ({ container: { addItem } })),
  };
  const block = {
    typeId: WARP_BLOCK_TYPE,
    dimension,
    location: { x: 4, y: 5, z: 6 },
    setType: vi.fn(),
  };
  return { player, block, dimension, addItem, guard: new WarpFormGuard() };
}

it("filters placement and rolls back a full registry with inventory overflow", async () => {
  const f = fixture();
  const registration = { run: vi.fn().mockResolvedValue("full") };
  registerWarpPlacement(registration, f.guard);
  const callback = game.place.mock.calls[0]?.[0] as (
    ev: PlayerPlaceBlockAfterEvent,
  ) => void;
  callback({
    player: f.player,
    block: { ...f.block, typeId: "minecraft:stone" },
  } as unknown as PlayerPlaceBlockAfterEvent);
  expect(registration.run).not.toHaveBeenCalled();
  const leftover = { typeId: WARP_BLOCK_TYPE, amount: 1 };
  f.addItem.mockReturnValue(leftover);
  callback({
    player: f.player,
    block: f.block,
  } as unknown as PlayerPlaceBlockAfterEvent);
  await flush();
  expect(registration.run).toHaveBeenCalledWith({
    playerId: "player",
    dimension: f.dimension.id,
    cell: f.block.location,
  });
  expect(f.block.setType).toHaveBeenCalledExactlyOnceWith("minecraft:air");
  expect(f.addItem).toHaveBeenCalledWith(expect.objectContaining(leftover));
  expect(f.dimension.spawnItem).toHaveBeenCalledWith(
    leftover,
    f.player.location,
  );
});

it.each(["registered", "unavailable"])(
  "does not roll back %s placement",
  async (result) => {
    const f = fixture();
    registerWarpPlacement({ run: vi.fn().mockResolvedValue(result) }, f.guard);
    game.place.mock.calls[0]?.[0]({ player: f.player, block: f.block });
    await flush();
    expect(f.block.setType).not.toHaveBeenCalled();
    expect(f.addItem).not.toHaveBeenCalled();
  },
);

it("does not refund creative placements", async () => {
  const f = fixture();
  f.player.getGameMode.mockReturnValue("Creative");
  registerWarpPlacement({ run: vi.fn().mockResolvedValue("full") }, f.guard);
  game.place.mock.calls[0]?.[0]({ player: f.player, block: f.block });
  await flush();
  expect(f.block.setType).toHaveBeenCalled();
  expect(f.addItem).not.toHaveBeenCalled();
});

it("filters removal using the broken permutation rather than the remaining block", () => {
  const f = fixture();
  const removal = { run: vi.fn() };
  registerWarpRemoval(removal);
  const callback = game.break.mock.calls[0]?.[0] as (
    ev: PlayerBreakBlockAfterEvent,
  ) => void;
  for (const typeId of ["minecraft:stone", WARP_BLOCK_TYPE])
    callback({
      block: { ...f.block, typeId: "minecraft:air" },
      dimension: f.dimension,
      brokenBlockPermutation: { type: { id: typeId } },
    } as unknown as PlayerBreakBlockAfterEvent);
  expect(removal.run).toHaveBeenCalledExactlyOnceWith({
    dimension: f.dimension.id,
    cell: f.block.location,
  });
});

function interactions(f: ReturnType<typeof fixture>, settled = true) {
  const taps = { run: vi.fn().mockResolvedValue(settled) };
  const list = { run: vi.fn().mockResolvedValue(undefined) };
  registerWarpBlockInteract(taps, list, f.guard);
  const registry = { registerCustomComponent: vi.fn() };
  game.startup.mock.calls[0]?.[0]({ blockComponentRegistry: registry });
  expect(registry.registerCustomComponent).toHaveBeenCalledWith(
    WARP_BLOCK_COMPONENT,
    expect.any(Object),
  );
  const component = registry.registerCustomComponent.mock
    .calls[0]?.[1] as BlockCustomComponent;
  const tap = () =>
    component.onPlayerInteract?.(
      {
        player: f.player,
        block: f.block,
        dimension: f.dimension,
      } as unknown as Parameters<
        NonNullable<BlockCustomComponent["onPlayerInteract"]>
      >[0],
      {} as CustomComponentParameters,
    );
  return { taps, list, tap };
}

it("counts one tap per player per tick and opens the list once the taps settle", async () => {
  const f = fixture();
  f.player.isSneaking = true;
  const i = interactions(f);
  game.currentTick = 7;
  i.tap();
  i.tap();
  expect(game.run).toHaveBeenCalledOnce();
  expect(i.taps.run).not.toHaveBeenCalled();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(i.taps.run).toHaveBeenCalledExactlyOnceWith({
    playerId: "player",
    dimension: f.dimension.id,
    cell: f.block.location,
    now: 7,
  });
  expect(i.list.run).toHaveBeenCalledExactlyOnceWith("player");
  game.currentTick = 8;
  i.tap();
  expect(game.run).toHaveBeenCalledTimes(2);
});

it("does not open the list for a tap that broke the block or was followed by another", async () => {
  const f = fixture();
  const i = interactions(f, false);
  i.tap();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(i.list.run).not.toHaveBeenCalled();
});

it("counts taps but skips the list while a warp form is open", async () => {
  const f = fixture();
  const i = interactions(f);
  f.guard.hold(asPlayerId(f.player.id), 0);
  game.currentTick = 100;
  i.tap();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(i.taps.run).toHaveBeenCalledOnce();
  expect(i.list.run).not.toHaveBeenCalled();
});

it("logs a failed tap instead of throwing", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const f = fixture();
  const i = interactions(f);
  i.taps.run.mockRejectedValue(Error("setType failed"));
  i.tap();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("setType failed"));
  expect(i.list.run).not.toHaveBeenCalled();
  warn.mockRestore();
});

it("cancels tool air and block actions, defers forms, and coalesces both event paths", async () => {
  const f = fixture();
  const list = { run: vi.fn().mockResolvedValue(undefined) };
  registerWarpTool(list, f.guard);
  const use = game.use.mock.calls[0]?.[0] as (ev: ItemUseBeforeEvent) => void;
  const interact = game.interact.mock.calls[0]?.[0] as (
    ev: PlayerInteractWithBlockBeforeEvent,
  ) => void;
  const air = {
    source: f.player,
    itemStack: { typeId: WARP_TOOL_TYPE },
    cancel: false,
  } as unknown as ItemUseBeforeEvent;
  const block = {
    player: f.player,
    itemStack: { typeId: WARP_TOOL_TYPE },
    isFirstEvent: true,
    cancel: false,
  } as unknown as PlayerInteractWithBlockBeforeEvent;
  use(air);
  interact(block);
  expect(air.cancel).toBe(true);
  expect(block.cancel).toBe(true);
  expect(list.run).not.toHaveBeenCalled();
  expect(game.run).toHaveBeenCalledOnce();
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(list.run).toHaveBeenCalledExactlyOnceWith("player");
  game.currentTick = 100;
  interact(block);
  game.run.mock.calls[1]?.[0]();
  await flush();
  expect(list.run).toHaveBeenCalledTimes(2);
});

it("ignores other items, held tool repeats, and busy players on the tool path", () => {
  const f = fixture();
  const list = { run: vi.fn().mockResolvedValue(undefined) };
  registerWarpTool(list, f.guard);
  game.use.mock.calls[0]?.[0]({
    source: f.player,
    itemStack: { typeId: "minecraft:stick" },
    cancel: false,
  });
  game.interact.mock.calls[0]?.[0]({
    player: f.player,
    itemStack: { typeId: WARP_TOOL_TYPE },
    isFirstEvent: false,
  });
  f.guard.hold(asPlayerId(f.player.id), 0);
  const ev = {
    source: f.player,
    itemStack: { typeId: WARP_TOOL_TYPE },
    cancel: false,
  };
  game.use.mock.calls[0]?.[0](ev);
  expect(ev.cancel).toBe(true);
  expect(game.run).not.toHaveBeenCalled();
  expect(list.run).not.toHaveBeenCalled();
});

it("catches placement rejection and releases the form lock", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const f = fixture();
  registerWarpPlacement(
    { run: vi.fn().mockRejectedValue(Error("save failed")) },
    f.guard,
  );
  game.place.mock.calls[0]?.[0]({ player: f.player, block: f.block });
  await flush();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("save failed"));
  expect(f.guard.tryOpen(asPlayerId(f.player.id), 100)).toBe(true);
  warn.mockRestore();
});

it("installs all warp subscriptions without reading storage during startup", () => {
  installWarp();
  for (const subscribe of [
    game.hitBlock,
    game.beforeBreak,
    game.place,
    game.break,
    game.startup,
    game.use,
    game.interact,
    game.leave,
  ])
    expect(subscribe).toHaveBeenCalledOnce();
  expect(game.getDynamicProperty).not.toHaveBeenCalled();
});

it("skips a deferred tool flow after the player leaves and releases the lock", async () => {
  const f = fixture();
  const list = { run: vi.fn().mockResolvedValue(undefined) };
  registerWarpTool(list, f.guard);
  game.use.mock.calls[0]?.[0]({
    source: f.player,
    itemStack: { typeId: WARP_TOOL_TYPE },
  });
  f.player.isValid = false;
  game.run.mock.calls[0]?.[0]();
  await flush();
  expect(list.run).not.toHaveBeenCalled();
  expect(f.guard.tryOpen(asPlayerId(f.player.id), 100)).toBe(true);
});
