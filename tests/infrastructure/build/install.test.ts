import { expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { registerEditTick } from "../../../src/infrastructure/build/bedrock/handlers/editTick";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import { installBuild } from "../../../src/infrastructure/build/install";

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
      afterEvents: {
        playerLeave: event,
        playerDimensionChange: event,
        entityDie: event,
      },
    },
    system: {
      runInterval: vi.fn(),
      afterEvents: { scriptEventReceive: event },
    },
  };
});
vi.mock("@minecraft/server-ui", () => ({
  ActionFormData: vi.fn(),
  ModalFormData: vi.fn(),
}));
vi.mock("../../../src/infrastructure/build/bedrock/handlers/wand", () => ({
  registerWand: vi.fn(),
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
    installBuild({ isProtected, isExcludedEntityType: () => false });
    const wand = vi.mocked(registerWand).mock.calls[0]?.[0];
    const jobs = vi.mocked(registerEditTick).mock.calls[0]?.[0];
    expect(wand).toBeDefined();
    expect(jobs).toBeDefined();
    if (!wand || !jobs) throw new Error("Build handlers were not installed");
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
