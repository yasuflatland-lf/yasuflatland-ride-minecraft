import {
  type Player,
  type PlayerInteractWithBlockBeforeEvent,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  BUILD_UNDO_TYPE,
  SELECTION_WAND_TYPE,
  TEST_EDIT_EVENT,
  TEST_INPUT_EVENT,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { installBuild } from "../../../src/infrastructure/build/install";
import { installBuildTestHooks } from "../../../src/infrastructure/build/testHooks/install";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getDimension: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("@minecraft/server", () => {
  const event = { subscribe: vi.fn() };
  return {
    Direction: {
      Up: "Up",
      Down: "Down",
      North: "North",
      South: "South",
      East: "East",
      West: "West",
    },
    ScriptEventSource: { Server: "Server" },
    GameMode: {},
    BlockPermutation: { resolve: engine.resolve },
    world: {
      getEntity: engine.getEntity,
      getDimension: engine.getDimension,
      getAllPlayers: vi.fn(() => []),
      beforeEvents: {
        playerBreakBlock: event,
        playerInteractWithEntity: event,
        playerInteractWithBlock: { subscribe: vi.fn() },
      },
      afterEvents: {
        playerLeave: { subscribe: vi.fn() },
        itemUse: event,
        entityHitEntity: event,
        playerDimensionChange: event,
        entityDie: event,
      },
    },
    system: {
      currentTick: 1,
      run: vi.fn(),
      runInterval: vi.fn(),
      sendScriptEvent: vi.fn(),
      afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
    },
  };
});
vi.mock("@minecraft/server-ui", () => ({
  ActionFormData: vi.fn(),
  ModalFormData: vi.fn(),
}));

it.each([false, true])(
  "wires edit ticks to world protection and owner escape (protected: %s)",
  (protectedCell) => {
    vi.resetAllMocks();
    const dimensionId = asDimensionId("minecraft:overworld");
    const playerId = asPlayerId("owner");
    const feet = { x: -2, y: 64, z: 3 };
    const stone = blockStateOf("minecraft:stone");
    const states = new Map<number, typeof stone>();
    const teleport = vi.fn();
    const setActionBar = vi.fn();
    let heldItem = SELECTION_WAND_TYPE;
    const player = {
      id: playerId,
      typeId: "minecraft:player",
      isValid: true,
      dimension: { id: dimensionId },
      location: feet,
      getComponent: (kind: string) =>
        kind === "minecraft:inventory"
          ? { container: { getItem: () => ({ typeId: heldItem }) } }
          : undefined,
      sendMessage: vi.fn(),
      teleport,
      onScreenDisplay: { setActionBar },
    } as unknown as Player;
    engine.getEntity.mockReturnValue(player);
    engine.resolve.mockImplementation((typeId, states) => ({ typeId, states }));
    engine.getDimension.mockReturnValue({
      heightRange: { min: -64, max: 320 },
      getBlock: (cell: typeof feet) => ({
        permutation: {
          type: { id: states.get(cell.y)?.typeId ?? "minecraft:air" },
          getAllStates: () => ({}),
        },
        hasTag: () => false,
        setPermutation: (state: typeof stone) => states.set(cell.y, state),
      }),
    });
    const isProtected = vi.fn(() => protectedCell);
    const build = installBuild({
      isProtected,
      isExcludedEntityType: () => false,
      uncopyableBlockTypes: [],
    });
    const start = { ...feet, y: feet.y - 1 };
    states.set(start.y, stone);
    function select(cell: typeof feet) {
      const event = {
        player,
        isFirstEvent: true,
        block: { dimension: player.dimension, location: cell },
      } as PlayerInteractWithBlockBeforeEvent;
      vi.mocked(system.run).mockClear();
      for (const [interact] of vi.mocked(
        world.beforeEvents.playerInteractWithBlock.subscribe,
      ).mock.calls)
        interact(event);
      for (const [act] of vi.mocked(system.run).mock.calls) act();
    }
    build.pressUndo.execute({ playerId });
    expect(build.repo.get(playerId)).toBeUndefined();
    expect(setActionBar).toHaveBeenLastCalledWith({
      translate: "yasu_build.message.nothing_to_undo",
      with: [],
    });
    select(start);
    heldItem = BUILD_UNDO_TYPE;
    build.routes.itemUse(player);
    expect(build.repo.get(playerId)?.flow.kind).toBe("idle");
    expect(setActionBar).toHaveBeenLastCalledWith({
      translate: "yasu_build.message.start_cleared",
      with: [],
    });
    heldItem = SELECTION_WAND_TYPE;
    select(start);
    select(feet);
    build.menuCases.confirmShape.execute({ playerId, style: "fill" });
    for (const [tick] of vi.mocked(system.runInterval).mock.calls) tick();
    const session = build.repo.get(playerId);
    expect(isProtected).toHaveBeenCalledWith(dimensionId, feet);
    expect(session?.isEditing).toBe(false);
    expect(session?.hasHistory).toBe(!protectedCell);
    expect(states.get(feet.y)).toEqual(protectedCell ? undefined : stone);
    if (protectedCell) expect(teleport).not.toHaveBeenCalled();
    else
      expect(teleport).toHaveBeenCalledExactlyOnceWith({
        x: -1.5,
        y: 65,
        z: 3.5,
      });
  },
);

it("installs test hooks separately and clears their player state on disconnect", () => {
  vi.resetAllMocks();
  const playerId = asPlayerId("builder");
  const player = {
    id: playerId,
    name: "Builder",
    typeId: "minecraft:player",
    isValid: true,
    onScreenDisplay: { setActionBar: vi.fn() },
  } as unknown as ReturnType<typeof world.getAllPlayers>[number];
  engine.getEntity.mockReturnValue(player);
  vi.mocked(world.getAllPlayers).mockReturnValue([player]);
  const build = installBuild({
    isProtected: () => false,
    isExcludedEntityType: () => false,
    uncopyableBlockTypes: [],
  });
  const subscribe = vi.mocked(system.afterEvents.scriptEventReceive.subscribe);
  expect(subscribe).not.toHaveBeenCalled();
  installBuildTestHooks(build);

  const send = (id: string, message: string) => {
    for (const [receive] of subscribe.mock.calls) {
      receive({ sourceType: ScriptEventSource.Server, id, message });
    }
  };
  const readDegrees = () => {
    send(TEST_EDIT_EVENT, `${playerId} state`);
    const [id, reply] =
      vi.mocked(system.sendScriptEvent).mock.calls.at(-1) ?? [];
    expect(id).toBe(TEST_RESULT_EVENT);
    return JSON.parse(reply ?? "{}").pasteReadyDegrees;
  };

  send(TEST_INPUT_EVENT, JSON.stringify({ player: player.name, touch: true }));
  expect(build.aimOverrides.get(playerId)?.input).toBe("touch");
  build.feedback.showMode(playerId, {
    kind: "pasteReady",
    size: { x: 2, y: 1, z: 3 },
    blockCount: 6,
    degrees: 90,
  });
  expect(readDegrees()).toBe(90);

  for (const [leave] of vi.mocked(world.afterEvents.playerLeave.subscribe).mock
    .calls)
    leave({ playerId, playerName: player.name });
  expect(build.aimOverrides.has(playerId)).toBe(false);
  expect(readDegrees()).toBeUndefined();
});

it("uses the supplied test corner and reports the selection menu only on a later tap", () => {
  vi.resetAllMocks();
  const playerId = asPlayerId("builder");
  const dimensionId = asDimensionId("minecraft:overworld");
  const start = { x: 0, y: 70, z: 0 };
  const end = { x: 4, y: 70, z: 4 };
  const player = {
    id: playerId,
    name: "Builder",
    typeId: "minecraft:player",
    isValid: true,
    isSneaking: true,
    dimension: { id: dimensionId },
    getBlockFromViewDirection: () => undefined,
    getHeadLocation: () => start,
    getViewDirection: () => ({ x: 1, y: 0, z: 0 }),
    onScreenDisplay: { setActionBar: vi.fn() },
  } as unknown as Player;
  vi.mocked(world.getAllPlayers).mockReturnValue([player]);
  engine.getEntity.mockReturnValue(player);
  engine.getDimension.mockReturnValue({ heightRange: { min: -64, max: 320 } });
  const build = installBuild({
    isProtected: () => false,
    isExcludedEntityType: () => false,
    uncopyableBlockTypes: [],
  });
  const session = build.repo.getOrCreate(playerId);
  session.setFlowForTest({
    kind: "point1",
    start: {
      dimensionId,
      cell: start,
      material: blockStateOf("minecraft:stone"),
    },
  });
  installBuildTestHooks(build);
  const tap = (type: "air" | "block") => {
    for (const [receive] of vi.mocked(
      system.afterEvents.scriptEventReceive.subscribe,
    ).mock.calls)
      receive({
        sourceType: ScriptEventSource.Server,
        id: TEST_TAP_EVENT,
        message: JSON.stringify({ player: player.name, tap: type, ...end }),
      });
    const [event, reply] =
      vi.mocked(system.sendScriptEvent).mock.lastCall ?? [];
    expect(event).toBe(TEST_RESULT_EVENT);
    return JSON.parse(reply ?? "{}");
  };
  expect(tap("air")).toMatchObject({
    flow: { kind: "baseHeight", taps: { to: end } },
    message: "heightAim",
  });
  const fixed = tap("block");
  expect(fixed.flow.kind).toBe("selected");
  expect(fixed.menu).toBeUndefined();
  expect(tap("air").menu).toContainEqual(
    expect.objectContaining({ id: "adjustHeight" }),
  );
});
