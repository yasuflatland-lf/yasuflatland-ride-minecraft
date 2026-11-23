import { InputMode, ScriptEventSource, system } from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  type AimOverride,
  BedrockAimReader,
  readInputKind,
} from "../../../src/infrastructure/build/bedrock/bedrockAimReader";
import { TEST_INPUT_EVENT } from "../../../src/infrastructure/build/identifiers";
import { TestAimReader } from "../../../src/infrastructure/build/testHooks/testAim";
import { registerTestInput } from "../../../src/infrastructure/build/testHooks/testInput";

const engine = vi.hoisted(() => ({
  getEntity: vi.fn(),
  getAllPlayers: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  GameMode: {},
  InputMode: {
    Touch: "Touch",
    KeyboardAndMouse: "KeyboardAndMouse",
    Gamepad: "Gamepad",
    MotionController: "MotionController",
  },
  Direction: {
    Up: "Up",
    Down: "Down",
    North: "North",
    South: "South",
    East: "East",
    West: "West",
  },
  ScriptEventSource: { Server: "Server", Entity: "Entity" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: engine.subscribe } },
  },
  world: { getEntity: engine.getEntity, getAllPlayers: engine.getAllPlayers },
}));

const id = asPlayerId("p");
const ray = {
  origin: { x: 1, y: 65.6, z: 2 },
  direction: { x: 0, y: 0, z: 1 },
};
function player() {
  return {
    typeId: "minecraft:player",
    isValid: true,
    inputInfo: { lastInputModeUsed: InputMode.Touch },
    getHeadLocation: () => ray.origin,
    getViewDirection: () => ray.direction,
    getBlockFromViewDirection: vi.fn(() => undefined as unknown),
  };
}
beforeEach(() => engine.getEntity.mockReset());

it("reads the head ray and optional block hit within build reach", () => {
  const p = player();
  engine.getEntity.mockReturnValue(p);
  const reader = new BedrockAimReader();
  expect(reader.aim(id)).toEqual({ ray, block: undefined, input: "touch" });
  const cell = { x: 1, y: 65, z: 8 };
  p.getBlockFromViewDirection.mockReturnValue({
    block: { location: cell },
    face: "North",
  });
  expect(reader.aim(id)).toEqual({
    ray,
    block: { cell, face: "north" },
    input: "touch",
  });
  expect(engine.getEntity).toHaveBeenCalledWith(id);
  expect(p.getBlockFromViewDirection).toHaveBeenCalledWith({
    maxDistance: BUILD_SPEC.reach,
  });
});

it("applies and clears the server's touch override for only the named player", () => {
  const builder = {
    ...player(),
    id,
    name: "Test Builder",
    inputInfo: { lastInputModeUsed: InputMode.KeyboardAndMouse },
  };
  const otherId = asPlayerId("other");
  const other = { ...builder, id: otherId, name: "Other" };
  engine.getAllPlayers.mockReturnValue([builder, other]);
  engine.getEntity.mockImplementation((playerId) =>
    playerId === id ? builder : other,
  );
  const overrides = new Map<ReturnType<typeof asPlayerId>, AimOverride>();
  const reader = new BedrockAimReader(overrides);
  registerTestInput(new TestAimReader(overrides));
  const receive = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!receive) throw new Error("Missing test input subscription");
  const send = (sourceType: ScriptEventSource, touch: boolean) =>
    receive({
      sourceType,
      id: TEST_INPUT_EVENT,
      message: JSON.stringify({ player: builder.name, touch }),
    });

  send(ScriptEventSource.Entity, true);
  expect(reader.aim(id)?.input).toBe("pointer");
  send(ScriptEventSource.Server, true);
  expect(reader.aim(id)?.input).toBe("touch");
  expect(reader.aim(otherId)?.input).toBe("pointer");
  send(ScriptEventSource.Server, false);
  expect(reader.aim(id)?.input).toBe("pointer");
});

it.each([
  [InputMode.Touch, "touch"],
  [InputMode.KeyboardAndMouse, "pointer"],
  [InputMode.Gamepad, "pointer"],
  [InputMode.MotionController, "pointer"],
  ["unknown", "pointer"],
  [undefined, "pointer"],
])("maps input mode %s to %s", (mode, expected) => {
  expect(readInputKind(() => mode)).toBe(expected);
});

it("falls back to pointer when input mode cannot be read", () => {
  const readMode = () => {
    throw new Error("input unavailable");
  };
  expect(readInputKind(readMode)).toBe("pointer");

  engine.getEntity.mockReturnValue({
    ...player(),
    get inputInfo() {
      return readMode();
    },
  });
  expect(new BedrockAimReader().aim(id)).toEqual({
    ray,
    block: undefined,
    input: "pointer",
  });
});

it("returns undefined for missing, invalid, non-player, and throwing handles", () => {
  const reader = new BedrockAimReader();
  for (const entity of [
    undefined,
    { ...player(), isValid: false },
    { ...player(), typeId: "minecraft:pig" },
  ]) {
    engine.getEntity.mockReturnValue(entity);
    expect(reader.aim(id)).toBeUndefined();
  }
  engine.getEntity.mockImplementation(() => {
    throw new Error("malformed id");
  });
  expect(reader.aim(id)).toBeUndefined();
  const p = player();
  engine.getEntity.mockReturnValue(p);
  p.getBlockFromViewDirection.mockImplementation(() => {
    throw new Error("gone");
  });
  expect(reader.aim(id)).toBeUndefined();
});

it("reads the current dimension and ignores absent or invalid player handles", () => {
  const reader = new BedrockAimReader();
  for (const dimensionId of ["minecraft:overworld", "minecraft:nether"]) {
    engine.getEntity.mockReturnValue({
      ...player(),
      dimension: { id: dimensionId },
    });
    expect(reader.dimensionOf(id)).toBe(dimensionId);
  }
  for (const entity of [
    undefined,
    { ...player(), isValid: false },
    { typeId: "minecraft:pig" },
  ]) {
    engine.getEntity.mockReturnValue(entity);
    expect(reader.dimensionOf(id)).toBeUndefined();
  }
  engine.getEntity.mockReturnValue({
    ...player(),
    get dimension() {
      throw new Error("Gone");
    },
  });
  expect(reader.dimensionOf(id)).toBeUndefined();
});
