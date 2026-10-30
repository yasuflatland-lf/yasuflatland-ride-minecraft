import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Outcome, StepSink } from "../../src/test-pack/outcome";
import { CANCEL_EVENT, TEST_EVENT } from "../../src/test-pack/protocol";

const harness = vi.hoisted(() => ({
  receive: (_ev: { id: string; message: string }) => {},
  setup: vi.fn(),
  first: vi.fn(),
  second: vi.fn(),
  system: {
    currentTick: 0,
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
  },
}));

vi.mock("@minecraft/server", () => ({
  system: harness.system,
  world: { getAllPlayers: () => [], getDimension: () => ({}) },
}));
vi.mock("../../src/test-pack/arena", () => ({ prepareRun: harness.setup }));
vi.mock("../../src/test-pack/catalog", () => ({
  CATALOG: [
    { name: "first", ticks: 20 },
    { name: "second", ticks: 40 },
    { name: "player", ticks: 10, needsPlayer: true },
  ],
}));
vi.mock("../../src/test-pack/scenarios/index", () => ({
  SCENARIOS: {
    first: harness.first,
    second: harness.second,
    player: vi.fn(),
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
  harness.system.afterEvents.scriptEventReceive.subscribe.mockImplementation(
    (receive) => {
      harness.receive = receive;
    },
  );
  harness.setup.mockResolvedValue([{}]);
  harness.first.mockResolvedValue({ pass: true, detail: "ok" });
  harness.second.mockResolvedValue({ pass: true, detail: "ok" });
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
  const setup = deferred<object[]>();
  harness.setup.mockReturnValue(setup.promise);
  for (const request of ["invalid unknown=1", "lanes lanes=2"]) {
    send(TEST_EVENT, request);
    expect(logs.at(-1)).toMatch(/SUMMARY pass=0 fail=1 ticks=0 ms=0 error=/);
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
