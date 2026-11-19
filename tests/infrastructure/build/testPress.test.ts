import { ScriptEventSource, system, world } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { DescribeBuild } from "../../../src/application/build/describeBuild";
import { registerTestPress } from "../../../src/infrastructure/build/bedrock/handlers/testPress";
import {
  TEST_PRESS_EVENT,
  TEST_RESULT_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { FakeSessions } from "../../application/build/fakes";

const clock = vi.hoisted(() => ({
  tick: 0,
  jobs: [] as { at: number; run: () => void }[],
}));
vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
    sendScriptEvent: vi.fn(),
    get currentTick() {
      return clock.tick;
    },
    runTimeout: (run: () => void, delay: number) =>
      clock.jobs.push({ at: clock.tick + delay, run }),
  },
  world: { getAllPlayers: vi.fn() },
}));

function setup() {
  vi.clearAllMocks();
  clock.tick = 0;
  clock.jobs.length = 0;
  const player = { id: "player", name: "Alex", isValid: true };
  vi.mocked(world.getAllPlayers).mockReturnValue([
    player as ReturnType<typeof world.getAllPlayers>[number],
  ]);
  const calls: string[] = [];
  const routes = {
    itemUse: vi.fn(() => {
      calls.push(`itemUse:${clock.tick}`);
    }),
    blockInteract: vi.fn(() => {
      calls.push(`blockInteract:${clock.tick}`);
    }),
  };
  const describe = new DescribeBuild(new FakeSessions());
  const status = vi.spyOn(describe, "editStatus");
  const messages = {
    forget: vi.fn(),
    lastMode:
      vi.fn<
        () =>
          | import("../../../src/application/build/ports/feedback").BuildMode
          | undefined
      >(),
    last: vi.fn(() => ({
      message: "editDone" as const,
      count: 45,
      skippedCount: 0,
    })),
    hints: vi.fn(() => 1),
  };
  registerTestPress(routes, describe, messages);
  const callback = vi.mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls[0]?.[0];
  if (!callback) throw new Error("Missing press subscription");
  const send = (
    message: string,
    sourceType = ScriptEventSource.Server,
    id = TEST_PRESS_EVENT,
  ) => callback({ message, sourceType, id } as Parameters<typeof callback>[0]);
  const advance = (ticks: number) => {
    for (let i = 0; i < ticks; i++) {
      clock.tick++;
      const ready = clock.jobs.filter((job) => job.at <= clock.tick);
      clock.jobs = clock.jobs.filter((job) => job.at > clock.tick);
      for (const job of ready) job.run();
    }
  };
  return { calls, routes, status, messages, player, send, advance };
}

it.each([0, 3, 40])(
  "fires routes in order with gap %s and replies after deferred work",
  (gap) => {
    const e = setup();
    e.send(`player itemUse,blockInteract ${gap}`);
    expect(e.messages.forget).toHaveBeenCalledExactlyOnceWith("player");
    expect(e.calls).toEqual(
      gap === 0 ? ["itemUse:0", "blockInteract:0"] : ["itemUse:0"],
    );
    e.advance(gap + 1);
    expect(e.calls).toEqual(["itemUse:0", `blockInteract:${gap}`]);
    expect(system.sendScriptEvent).not.toHaveBeenCalled();
    e.advance(1);
    expect(system.sendScriptEvent).toHaveBeenCalledExactlyOnceWith(
      TEST_RESULT_EVENT,
      JSON.stringify({
        player: "Alex",
        flow: { kind: "idle" },
        timedOut: false,
        message: "editDone",
        count: 45,
        skippedCount: 0,
        undoHints: 1,
        ticks: 2,
      }),
    );
  },
);

it.each([
  "",
  "player",
  "player invalid",
  "player itemUse,",
  "player itemUse -1",
  "player itemUse 1.5",
  "player itemUse 41",
  "player itemUse 0 extra",
  "missing itemUse",
])("ignores invalid input %s", (command) => {
  const e = setup();
  e.send(command);
  e.advance(250);
  expect(e.calls).toEqual([]);
  expect(e.messages.forget).not.toHaveBeenCalled();
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
});

it("waits for editing to settle and reports timeout after 200 ticks", () => {
  const e = setup();
  e.status.mockReturnValue({ flow: { kind: "idle" }, isEditing: true });
  e.send("player blockInteract");
  e.advance(199);
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
  e.advance(1);
  expect(system.sendScriptEvent).toHaveBeenCalledOnce();
  expect(
    JSON.parse(vi.mocked(system.sendScriptEvent).mock.calls[0]?.[1] ?? "{}"),
  ).toMatchObject({ timedOut: true, ticks: 200 });
});

it("stops waiting as soon as an edit settles", () => {
  const e = setup();
  e.status.mockReturnValue({ flow: { kind: "idle" }, isEditing: true });
  e.send("player itemUse");
  e.advance(4);
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
  e.status.mockReturnValue({ flow: { kind: "idle" }, isEditing: false });
  e.advance(1);
  expect(system.sendScriptEvent).toHaveBeenCalledOnce();
});

it("ignores other events and abandons delayed presses after disconnect", () => {
  const e = setup();
  e.send("player itemUse", "Entity" as ScriptEventSource);
  e.send("player itemUse", ScriptEventSource.Server, TEST_RESULT_EVENT);
  expect(e.calls).toEqual([]);
  e.send("player itemUse,blockInteract 3");
  e.player.isValid = false;
  e.advance(250);
  expect(e.calls).toEqual(["itemUse:0"]);
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
});

it.each([0, 90, 180, 270] as const)(
  "reports shown paste-ready degrees %s in the press reply",
  (degrees) => {
    const e = setup();
    e.messages.lastMode.mockReturnValue({
      kind: "pasteReady",
      size: { x: 1, y: 2, z: 3 },
      blockCount: 6,
      degrees,
    });
    e.send("player blockInteract");
    e.advance(2);
    expect(
      JSON.parse(vi.mocked(system.sendScriptEvent).mock.calls[0]?.[1] ?? "{}"),
    ).toMatchObject({ pasteReadyDegrees: degrees });
  },
);
