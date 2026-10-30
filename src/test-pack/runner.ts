// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { system, world } from "@minecraft/server";
import { type Arena, prepareRun, removeVehicles } from "./arena";
import { CATALOG, type ScenarioSpec } from "./catalog";
import { isFeatureTag } from "./features";
import { laneOf } from "./lane";
import { type Outcome, stepLines } from "./outcome";
import { coverageGaps, planOf } from "./plan";
import {
  CANCEL_EVENT,
  LOG_TAG,
  parseRunRequest,
  type RunRequest,
  TEST_EVENT,
} from "./protocol";
import {
  formatPlan,
  formatResult,
  formatSummary,
  linePrefix,
  READY,
} from "./resultLog";
import { SCENARIOS } from "./scenarios/index";

function log(runId: string, msg: string): void {
  console.warn(`${linePrefix(runId)}${msg}`);
}

interface ActiveRun {
  readonly runId: string;
  readonly startTick: number;
  readonly startMs: number;
  passed: number;
  failed: number;
  cancelled: boolean;
  settled: Promise<void>;
}

function summary(run: ActiveRun, error?: string): void {
  log(
    run.runId,
    formatSummary({
      pass: run.passed,
      fail: run.failed,
      ticks: system.currentTick - run.startTick,
      ms: Date.now() - run.startMs,
      error,
    }),
  );
}

function reject(runId: string, error: string): void {
  log(runId, formatSummary({ pass: 0, fail: 1, ticks: 0, ms: 0, error }));
}

async function runAll(request: RunRequest, state: ActiveRun): Promise<void> {
  const { runId } = state;
  const { shard, features } = request;
  const { missing, extra } = coverageGaps(
    CATALOG.map((spec) => spec.name),
    Object.keys(SCENARIOS),
  );
  if (missing.length > 0 || extra.length > 0) {
    state.failed++;
    summary(
      state,
      `catalog mismatch missing=${missing.join(",")} extra=${extra.join(",")}`,
    );
    return;
  }
  const unknown = features?.find((tag) => !isFeatureTag(tag));
  if (unknown !== undefined) {
    state.failed++;
    summary(state, `unknown feature ${unknown}`);
    return;
  }
  const tags = features?.filter(isFeatureTag);
  const plan = planOf(CATALOG, {
    shard,
    features: tags,
    lanes: request.lanes,
    playerConnected: world.getAllPlayers().length > 0,
  });
  const laneCount = plan.lanes.length;
  log(
    runId,
    formatPlan({
      runs: plan.runs.length,
      skipped: plan.skipped.length,
      unselected: plan.unselected,
      ticks: plan.expectedTicks,
      lanes: laneCount,
    }),
  );
  for (const { name, reason } of plan.skipped)
    log(runId, `SKIP ${name}: ${reason}`);
  const dim = world.getDimension("overworld");
  const lanes =
    laneCount === 1
      ? [laneOf(request.at)]
      : plan.lanes.map((_, i) => laneOf(i));
  const arenas = await prepareRun(dim, lanes);
  if (state.cancelled) return;
  log(runId, READY);

  // A throw is a FAIL of that scenario only, so one lane never stops another.
  const runScenario = async (
    arena: Arena,
    spec: ScenarioSpec,
    laneIndex: number,
  ): Promise<void> => {
    const { name } = spec;
    const start = system.currentTick;
    let outcome: Outcome;
    try {
      const run = SCENARIOS[name];
      if (!run) throw new Error(`scenario not registered: ${name}`);
      outcome = await run(arena, (result) => {
        if (state.cancelled) return;
        for (const line of stepLines(result)) log(runId, `${name} ${line}`);
      });
    } catch (e) {
      outcome = { pass: false, detail: `error: ${e}` };
    }
    if (state.cancelled) return;
    if (outcome.pass) state.passed++;
    else state.failed++;
    log(
      runId,
      formatResult({
        verdict: outcome.pass ? "PASS" : "FAIL",
        name,
        ticks: system.currentTick - start,
        lane: laneCount === 1 ? undefined : laneIndex,
        detail: outcome.detail,
      }),
    );
    for (const line of outcome.lines ?? []) log(runId, `${name} ${line}`);
  };
  const runLane = async (
    arena: Arena,
    specs: readonly ScenarioSpec[],
    laneIndex: number,
  ): Promise<void> => {
    for (const spec of specs) {
      if (state.cancelled) return;
      await runScenario(arena, spec, laneIndex);
    }
  };

  await Promise.all(
    plan.lanes.map((specs, i) => {
      const arena = arenas[i];
      if (!arena) throw new Error(`arena ${i} not prepared`);
      return runLane(arena, specs, i);
    }),
  );
  if (plan.exclusive.length > 0 && !state.cancelled) {
    await removeVehicles(dim);
    const arena = arenas[0];
    if (!arena) throw new Error("arena 0 not prepared");
    await runLane(arena, plan.exclusive, 0);
  }
  if (state.cancelled) return;
  summary(state);
}

// One run at a time, covering every lane: two runs would share the arenas and
// kill each other's cars in prepareRun.
let activeRun: ActiveRun | undefined;

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === CANCEL_EVENT) {
    if (activeRun?.runId !== ev.message) return;
    const state = activeRun;
    state.cancelled = true;
    summary(state, "cancelled");
    return;
  }
  if (ev.id !== TEST_EVENT) return;
  const parsed = parseRunRequest(ev.message);
  if (!parsed.ok) {
    reject(parsed.runId, parsed.error);
    return;
  }
  const request = parsed.request;
  const { runId } = request;
  if (activeRun !== undefined && !activeRun.cancelled) {
    reject(runId, `run ${activeRun.runId} in progress`);
    return;
  }
  const state: ActiveRun = {
    runId,
    startTick: system.currentTick,
    startMs: Date.now(),
    passed: 0,
    failed: 0,
    cancelled: false,
    settled: Promise.resolve(),
  };
  const previous = activeRun;
  activeRun = state;
  // Cancellation cannot stop an in-flight scenario from mutating the arena.
  state.settled = (
    previous
      ? previous.settled.then(() => {
          if (!state.cancelled) return runAll(request, state);
        })
      : runAll(request, state)
  )
    .catch((e) => {
      if (state.cancelled) return;
      state.failed++;
      summary(state, String(e));
    })
    .finally(() => {
      if (activeRun === state) activeRun = undefined;
    });
});
console.warn(`${LOG_TAG} loaded`);
