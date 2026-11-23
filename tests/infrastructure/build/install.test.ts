import { ScriptEventSource, system, world } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { registerEditTick } from "../../../src/infrastructure/build/bedrock/handlers/editTick";
import { registerPasteControls } from "../../../src/infrastructure/build/bedrock/handlers/pasteControls";
import { registerTapTarget } from "../../../src/infrastructure/build/bedrock/handlers/tapTarget";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import {
  TEST_EDIT_EVENT,
  TEST_INPUT_EVENT,
  TEST_RESULT_EVENT,
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
      getAllPlayers: vi.fn(),
      afterEvents: {
        playerLeave: { subscribe: vi.fn() },
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
vi.mock(
  "../../../src/infrastructure/build/bedrock/handlers/pasteControls",
  () => ({
    registerPasteControls: vi.fn(),
  }),
);

vi.mock("../../../src/infrastructure/build/bedrock/handlers/wand", () => ({
  registerWand: vi.fn(),
}));
vi.mock("../../../src/infrastructure/build/bedrock/handlers/tapTarget", () => ({
  registerTapTarget: vi.fn(),
}));
vi.mock("../../../src/infrastructure/build/bedrock/handlers/editTick", () => ({
  registerEditTick: vi.fn(),
}));

it.each([false, true])(
  "wires edit ticks to world protection and owner escape (protected: %s)",
  (protectedCell) => {
    vi.clearAllMocks();
    const dimensionId = asDimensionId("minecraft:overworld");
    const playerId = asPlayerId("owner");
    const feet = { x: -2, y: 64, z: 3 };
    const stone = blockStateOf("minecraft:stone");
    const states = new Map<number, typeof stone>();
    const teleport = vi.fn();
    const setActionBar = vi.fn();
    engine.getEntity.mockReturnValue({
      typeId: "minecraft:player",
      isValid: true,
      dimension: { id: dimensionId },
      location: feet,
      getComponent: () => undefined,
      teleport,
      onScreenDisplay: { setActionBar },
    });
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
    installBuild({
      isProtected,
      isExcludedEntityType: () => false,
      uncopyableBlockTypes: [],
    });
    const wand = vi.mocked(registerWand).mock.calls[0]?.[0];
    const jobs = vi.mocked(registerEditTick).mock.calls[0]?.[0];
    expect(wand).toBeDefined();
    expect(jobs).toBeDefined();
    if (!wand || !jobs) throw new Error("Build handlers were not installed");
    const controls = vi.mocked(registerPasteControls).mock.calls[0]?.[0];
    expect(controls).toBeDefined();
    expect(controls?.repo).toBe(wand.repo);
    expect(controls?.aim).toBe(wand.aim);
    expect(controls?.pressPasteAim).toBe(wand.pressPasteAim);
    expect(controls?.rotateDebounce).toBeDefined();
    expect(controls?.pasteDebounce).toBe(wand.pasteDebounce);
    expect(controls?.undoDebounce).toBeDefined();
    const tapTarget = vi.mocked(registerTapTarget).mock.calls[0]?.[0];
    expect(tapTarget?.debounce).toBe(wand.debounce);
    expect(tapTarget?.repo).toBe(wand.repo);
    controls?.pressUndo.execute({ playerId });
    expect(wand.repo.get(playerId)).toBeUndefined();
    expect(setActionBar).toHaveBeenLastCalledWith({
      translate: "yasu_build.message.nothing_to_undo",
      with: [],
    });
    const session = wand.repo.getOrCreate(playerId);
    session.beginEdit();
    jobs.start(
      playerId,
      dimensionId,
      [{ cell: feet, after: stone }],
      "undoable",
    );
    jobs.step();
    expect(isProtected).toHaveBeenCalledWith(dimensionId, feet);
    expect(session.isEditing).toBe(false);
    expect(session.hasHistory).toBe(!protectedCell);
    expect(states.get(feet.y)).toEqual(protectedCell ? undefined : stone);
    expect(setActionBar).toHaveBeenCalled();
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
  vi.clearAllMocks();
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

  const leave = vi.mocked(world.afterEvents.playerLeave.subscribe).mock
    .calls[0]?.[0];
  if (!leave) throw new Error("Missing player leave subscription");
  leave({ playerId, playerName: player.name });
  expect(build.aimOverrides.has(playerId)).toBe(false);
  expect(readDegrees()).toBeUndefined();
});
