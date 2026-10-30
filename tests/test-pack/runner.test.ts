import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Outcome, StepSink } from "../../src/test-pack/outcome";
import { CANCEL_EVENT, TEST_EVENT } from "../../src/test-pack/protocol";

const harness = vi.hoisted(() => ({
  receive: (_ev: { id: string; message: string }) => {},
  setup: vi.fn(),
  remove: vi.fn(),
  first: vi.fn(),
  second: vi.fn(),
  player: vi.fn(),
  playerConnected: false,
  system: {
    currentTick: 0,
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
  },
}));

vi.mock("@minecraft/server", () => ({
  system: harness.system,
  world: {
    getAllPlayers: () => (harness.playerConnected ? [{}] : []),
    getDimension: () => ({}),
  },
}));
vi.mock("../../src/test-pack/arena", () => ({
  prepareRun: harness.setup,
  removeVehicles: harness.remove,
}));
vi.mock("../../src/test-pack/catalog", () => ({
  CATALOG: [
    {
      name: "first",
      ticks: 20,
      isolation: "lane",
      file: "x",
      vehicles: 0,
      features: [],
      needsPlayer: false,
    },
    {
      name: "second",
      ticks: 40,
      isolation: "lane",
      file: "x",
      vehicles: 0,
      features: [],
      needsPlayer: false,
    },
    {
      name: "player",
      ticks: 10,
      isolation: "exclusive",
      file: "x",
      vehicles: 0,
      features: [],
      needsPlayer: true,
    },
  ],
}));
vi.mock("../../src/test-pack/scenarios/index", () => ({
  SCENARIOS: {
    first: harness.first,
    second: harness.second,
    player: harness.player,
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let logs: string[];
function send(id: string, message: string) {
  harness.receive({ id, message });
}
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  logs = [];
  vi.spyOn(console, "warn").mockImplementation((line: string) =>
    logs.push(line),
  );
  harness.system.currentTick = 0;
  harness.playerConnected = false;
  harness.system.afterEvents.scriptEventReceive.subscribe.mockImplementation(
    (receive) => {
      harness.receive = receive;
    },
  );
  harness.setup.mockResolvedValue([{}]);
  harness.first.mockResolvedValue({ pass: true, detail: "ok" });
  harness.second.mockResolvedValue({ pass: true, detail: "ok" });
  harness.player.mockResolvedValue({ pass: true, detail: "ok" });
  await import("../../src/test-pack/runner");
  logs = [];
});
afterEach(() => vi.restoreAllMocks());

it("logs PLAN and SKIP before setup, then streams steps and results before completion", async () => {
  const setup = deferred<object[]>();
  const first = deferred<Outcome>();
  const second = deferred<Outcome>();
  harness.setup.mockReturnValue(setup.promise);
  harness.first.mockReturnValue(first.promise);
  harness.second.mockReturnValue(second.promise);
  send(TEST_EVENT, "stream");
  expect(logs).toEqual([
    "[YASU-RIDE-TEST] stream PLAN runs=2 skipped=1 unselected=0 ticks=60 lanes=1",
    "[YASU-RIDE-TEST] stream SKIP player: a connected player is required",
  ]);
  setup.resolve([{}]);
  await flush();
  expect(logs.at(-1)).toBe("[YASU-RIDE-TEST] stream READY");
  const sink = harness.first.mock.calls[0]?.[1] as StepSink;
  sink({ name: "chair", pass: true, detail: "seated" });
  expect(logs.at(-1)).toBe(
    "[YASU-RIDE-TEST] stream first step chair PASS seated",
  );
  harness.system.currentTick = 20;
  first.resolve({ pass: true, detail: "done", lines: ["extra"] });
  await flush();
  expect(logs.slice(-2)).toEqual([
    "[YASU-RIDE-TEST] stream PASS first ticks=20 done",
    "[YASU-RIDE-TEST] stream first extra",
  ]);
  expect(logs.some((line) => line.includes("SUMMARY"))).toBe(false);
  harness.system.currentTick = 60;
  second.resolve({ pass: false, detail: "failed" });
  await flush();
  expect(logs.at(-1)).toMatch(/SUMMARY pass=1 fail=1 ticks=60 ms=\d+$/);
});

it("cancels only the matching run, suppresses pending output and preserves a newer active run", async () => {
  const old = deferred<Outcome>();
  const newer = deferred<Outcome>();
  harness.first
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(newer.promise);
  send(TEST_EVENT, "old");
  await flush();
  const oldSink = harness.first.mock.calls[0]?.[1] as StepSink;
  send(CANCEL_EVENT, "other");
  expect(logs.some((line) => line.includes("cancelled"))).toBe(false);
  send(CANCEL_EVENT, "old");
  expect(logs.at(-1)).toMatch(
    /old SUMMARY pass=0 fail=0 ticks=0 ms=\d+ error=cancelled$/,
  );
  const oldLogs = logs.filter((line) => line.includes(" old "));
  send(TEST_EVENT, "newer");
  await flush();
  expect(harness.setup).toHaveBeenCalledTimes(1);
  expect(harness.first).toHaveBeenCalledTimes(1);
  send(TEST_EVENT, "waiting");
  expect(logs.at(-1)).toContain("error=run newer in progress");
  oldSink({ name: "late", pass: true, detail: "ignored" });
  old.resolve({ pass: true, detail: "ignored" });
  await flush();
  expect(harness.setup).toHaveBeenCalledTimes(2);
  expect(harness.first).toHaveBeenCalledTimes(2);
  expect(logs.filter((line) => line.includes(" old "))).toEqual(oldLogs);
  expect(harness.second).not.toHaveBeenCalled();
  send(TEST_EVENT, "third");
  expect(logs.at(-1)).toContain("error=run newer in progress");
  newer.resolve({ pass: true, detail: "ok" });
  await flush();
  expect(logs.at(-1)).toMatch(/newer SUMMARY pass=2 fail=0 ticks=0 ms=\d+$/);
});

it("skips a queued run cancelled before the previous scenario settles", async () => {
  const old = deferred<Outcome>();
  harness.first.mockReturnValueOnce(old.promise);
  send(TEST_EVENT, "old");
  await flush();
  send(CANCEL_EVENT, "old");
  send(TEST_EVENT, "queued");
  send(CANCEL_EVENT, "queued");
  old.resolve({ pass: true, detail: "ignored" });
  await flush();
  expect(harness.setup).toHaveBeenCalledTimes(1);
  expect(harness.first).toHaveBeenCalledTimes(1);
  send(TEST_EVENT, "next");
  await flush();
  expect(logs.at(-1)).toMatch(/next SUMMARY pass=2 fail=0 ticks=0 ms=\d+$/);
});

it("suppresses READY after cancellation during setup and retains request validation", async () => {
  let now = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now++);
  const setup = deferred<object[]>();
  harness.setup.mockReturnValue(setup.promise);
  for (const request of ["invalid unknown=1", "features features=nonsense"]) {
    send(TEST_EVENT, request);
    expect(logs.at(-1)).toMatch(/SUMMARY pass=0 fail=1 ticks=0 ms=\d+ error=/);
  }
  expect(harness.setup).not.toHaveBeenCalled();
  send(TEST_EVENT, "setup");
  send(CANCEL_EVENT, "setup");
  const before = [...logs];
  setup.resolve([{}]);
  await flush();
  expect(logs).toEqual(before);
  expect(harness.first).not.toHaveBeenCalled();
});

it("logs the makespan and lane numbers for a two-lane request", async () => {
  const arenas = [{}, {}];
  const first = deferred<Outcome>();
  const second = deferred<Outcome>();
  harness.setup.mockResolvedValue(arenas);
  harness.first.mockReturnValue(first.promise);
  harness.second.mockReturnValue(second.promise);
  send(TEST_EVENT, "parallel lanes=2");
  await flush();
  expect(logs[0]).toBe(
    "[YASU-RIDE-TEST] parallel PLAN runs=2 skipped=1 unselected=0 ticks=40 lanes=2",
  );
  expect(harness.second.mock.calls[0]?.[0]).toBe(arenas[0]);
  expect(harness.first.mock.calls[0]?.[0]).toBe(arenas[1]);
  harness.system.currentTick = 20;
  first.resolve({ pass: true, detail: "ok" });
  await flush();
  expect(logs.at(-1)).toBe(
    "[YASU-RIDE-TEST] parallel PASS first ticks=20 lane=1 ok",
  );
  harness.system.currentTick = 40;
  second.resolve({ pass: true, detail: "ok" });
  await flush();
  expect(logs.at(-2)).toBe(
    "[YASU-RIDE-TEST] parallel PASS second ticks=40 lane=0 ok",
  );
  expect(logs.at(-1)).toMatch(/SUMMARY pass=2 fail=0 ticks=40 ms=\d+$/);
});

it("fails only the throwing scenario while the other lane continues", async () => {
  const second = deferred<Outcome>();
  harness.setup.mockResolvedValue([{}, {}]);
  harness.first.mockImplementation(() => {
    throw new Error("scenario broke");
  });
  harness.second.mockReturnValue(second.promise);
  send(TEST_EVENT, "error lanes=2");
  await flush();
  expect(logs.at(-1)).toBe(
    "[YASU-RIDE-TEST] error FAIL first ticks=0 lane=1 error: Error: scenario broke",
  );
  expect(logs.some((line) => line.includes("SUMMARY"))).toBe(false);
  second.resolve({ pass: true, detail: "survived" });
  await flush();
  expect(logs.at(-2)).toBe(
    "[YASU-RIDE-TEST] error PASS second ticks=0 lane=0 survived",
  );
  expect(logs.at(-1)).toMatch(/SUMMARY pass=1 fail=1 ticks=0 ms=\d+$/);
});

it("waits for every lane and vehicle removal before running exclusive specs on lane zero", async () => {
  const arenas = [{}, {}];
  const first = deferred<Outcome>();
  const second = deferred<Outcome>();
  const removal = deferred<void>();
  harness.playerConnected = true;
  harness.setup.mockResolvedValue(arenas);
  harness.first.mockReturnValue(first.promise);
  harness.second.mockReturnValue(second.promise);
  harness.remove.mockReturnValue(removal.promise);
  send(TEST_EVENT, "exclusive lanes=2");
  await flush();
  expect(logs[0]).toBe(
    "[YASU-RIDE-TEST] exclusive PLAN runs=3 skipped=0 unselected=0 ticks=50 lanes=2",
  );
  expect(harness.remove).not.toHaveBeenCalled();
  expect(harness.player).not.toHaveBeenCalled();
  second.resolve({ pass: true, detail: "ok" });
  await flush();
  expect(harness.remove).not.toHaveBeenCalled();
  expect(harness.player).not.toHaveBeenCalled();
  first.resolve({ pass: true, detail: "ok" });
  await flush();
  expect(harness.remove).toHaveBeenCalledTimes(1);
  expect(harness.player).not.toHaveBeenCalled();
  expect(logs.some((line) => line.includes("SUMMARY"))).toBe(false);
  removal.resolve();
  await flush();
  expect(harness.player).toHaveBeenCalledTimes(1);
  expect(harness.player.mock.calls[0]?.[0]).toBe(arenas[0]);
  expect(logs.at(-2)).toBe(
    "[YASU-RIDE-TEST] exclusive PASS player ticks=0 lane=0 ok",
  );
  expect(logs.at(-1)).toMatch(/SUMMARY pass=3 fail=0 ticks=0 ms=\d+$/);
});

it("suppresses output from all pending lanes and skips exclusive specs after cancellation", async () => {
  const first = deferred<Outcome>();
  const second = deferred<Outcome>();
  harness.playerConnected = true;
  harness.setup.mockResolvedValue([{}, {}]);
  harness.first.mockReturnValue(first.promise);
  harness.second.mockReturnValue(second.promise);
  send(TEST_EVENT, "cancel lanes=2");
  await flush();
  expect(harness.first).toHaveBeenCalledTimes(1);
  expect(harness.second).toHaveBeenCalledTimes(1);
  send(CANCEL_EVENT, "cancel");
  expect(logs.at(-1)).toMatch(
    /cancel SUMMARY pass=0 fail=0 ticks=0 ms=\d+ error=cancelled$/,
  );
  const before = [...logs];
  for (const scenario of [harness.first, harness.second]) {
    const sink = scenario.mock.calls[0]?.[1] as StepSink;
    sink({ name: "late", pass: true, detail: "ignored" });
  }
  first.resolve({ pass: true, detail: "ignored", lines: ["late detail"] });
  await flush();
  expect(logs).toEqual(before);
  second.resolve({ pass: false, detail: "ignored", lines: ["late failure"] });
  await flush();
  expect(logs).toEqual(before);
  expect(harness.remove).not.toHaveBeenCalled();
  expect(harness.player).not.toHaveBeenCalled();
});
