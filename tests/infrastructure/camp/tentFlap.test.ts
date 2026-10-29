import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UseTentFlap } from "../../../src/application/camp/useTentFlap";
import { registerTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/tentFlap";
import { registerTestTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap";
import {
  TENT_FLAP_COMPONENT,
  TEST_TENT_FLAP_EVENT,
} from "../../../src/infrastructure/camp/identifiers";
import { NAMESPACE } from "../../../src/infrastructure/shared/identifiers";
import { defined } from "../../support/defined";

type Handler = (ev: never) => void;

const game = vi.hoisted(() => ({
  startup: vi.fn<(handler: Handler) => void>(),
  script: vi.fn<(handler: Handler, options?: unknown) => void>(),
  currentTick: 42,
}));
vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server", Entity: "Entity" },
  system: {
    get currentTick() {
      return game.currentTick;
    },
    beforeEvents: { startup: { subscribe: game.startup } },
    afterEvents: { scriptEventReceive: { subscribe: game.script } },
  },
}));

function fakeUseFlap() {
  const execute = vi.fn(() => true);
  return { execute, useFlap: { execute } as unknown as UseTentFlap };
}

beforeEach(() => vi.clearAllMocks());

describe("registerTentFlap (ADR 0132)", () => {
  function interact(flapAt: Parameters<typeof registerTentFlap>[1]) {
    const { execute, useFlap } = fakeUseFlap();
    registerTentFlap(useFlap, flapAt);
    const registerCustomComponent = vi.fn();
    (
      defined(game.startup.mock.calls[0]?.[0], "startup") as (
        ev: unknown,
      ) => void
    )({ blockComponentRegistry: { registerCustomComponent } });
    const [name, component] = defined(
      registerCustomComponent.mock.calls[0],
      "component",
    ) as [string, { onPlayerInteract: (ev: unknown) => void }];
    expect(name).toBe(TENT_FLAP_COMPONENT);
    return { execute, onPlayerInteract: component.onPlayerInteract };
  }
  const tap = (player?: { id: string }) => ({
    dimension: { id: "minecraft:overworld" },
    block: { location: { x: 1, y: 2, z: 3 } },
    player,
  });

  it("taps the owned flap with the current tick and the player", () => {
    const flapAt = vi.fn(() => ({ tentId: "t", flap: "left" }) as never);
    const { execute, onPlayerInteract } = interact(flapAt);
    onPlayerInteract(tap({ id: "p" }));
    expect(flapAt).toHaveBeenCalledWith("minecraft:overworld", {
      x: 1,
      y: 2,
      z: 3,
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      tentId: "t",
      flap: "left",
      tick: 42,
      playerId: "p",
    });
    onPlayerInteract(tap());
    expect(execute).toHaveBeenLastCalledWith({
      tentId: "t",
      flap: "left",
      tick: 42,
      playerId: undefined,
    });
  });

  it("does nothing on a cell with no owner", () => {
    const { execute, onPlayerInteract } = interact(() => undefined);
    onPlayerInteract(tap({ id: "p" }));
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("registerTestTentFlap (ADR 0010, 0132)", () => {
  function setup() {
    const { execute, useFlap } = fakeUseFlap();
    registerTestTentFlap(useFlap);
    expect(game.script.mock.calls[0]?.[1]).toEqual({ namespaces: [NAMESPACE] });
    const handler = defined(game.script.mock.calls[0]?.[0], "handler") as (
      ev: unknown,
    ) => void;
    return { execute, handler };
  }
  const event = (
    message: string,
    id = TEST_TENT_FLAP_EVENT,
    sourceType = "Server",
  ) => ({
    id,
    message,
    sourceType,
  });

  it("taps the named flap without a player", () => {
    const { execute, handler } = setup();
    handler(event("  t1   bedroom "));
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      tentId: "t1",
      flap: "bedroom",
      tick: 42,
    });
  });

  it("ignores other events, other sources, an empty tent id, and an unknown flap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { execute, handler } = setup();
    handler(event("t1 front", "yasu_ride:test_tent_hit"));
    handler(event("t1 front", TEST_TENT_FLAP_EVENT, "Entity"));
    handler(event(""));
    handler(event("t1 door"));
    handler(event("t1"));
    expect(execute).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});
