// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { system, world } from "@minecraft/server";
import { prepareRun } from "./arena";
import { CATALOG } from "./catalog";
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

async function runAll(
  { shard, at, features }: RunRequest,
  state: ActiveRun,
): Promise<void> {
  const { runId } = state;
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
  const tags = features?.filter(isFeatureTag);
  const unknown = features?.find((tag) => !isFeatureTag(tag));
  if (unknown !== undefined) {
    state.failed++;
    summary(state, `unknown feature ${unknown}`);
    return;
  }
  const plan = planOf(CATALOG, {
    shard,
    features: tags,
    playerConnected: world.getAllPlayers().length > 0,
  });
  log(
    runId,
    formatPlan({
      runs: plan.runs.length,
      skipped: plan.skipped.length,
      unselected: plan.unselected,
      ticks: plan.expectedTicks,
      lanes: 1,
    }),
  );
  for (const { name, reason } of plan.skipped)
    log(runId, `SKIP ${name}: ${reason}`);
  const [a] = await prepareRun(world.getDimension("overworld"), [laneOf(at)]);
  if (!a) throw new Error("arena not prepared");
  if (state.cancelled) return;
  log(runId, READY);
  for (const { name } of plan.runs) {
    if (state.cancelled) return;
    const start = system.currentTick;
    let outcome: Outcome;
    try {
      const run = SCENARIOS[name];
      if (!run) throw new Error(`scenario not registered: ${name}`);
      outcome = await run(a, (result) => {
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
        detail: outcome.detail,
      }),
    );
    for (const line of outcome.lines ?? []) log(runId, `${name} ${line}`);
  }
  summary(state);
}

function unsupportedOption(request: RunRequest): string | undefined {
  if (request.lanes !== 1) return "lanes";
  return undefined;
}

// Two runs would share the arena and kill each other's cars in prepareRun.
let activeRun: ActiveRun | undefined;

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === CANCEL_EVENT) {
    if (activeRun?.runId !== ev.message) return;
    const state = activeRun;
    state.cancelled = true;
    summary(state, "cancelled");
    activeRun = undefined;
    return;
  }
  if (ev.id !== TEST_EVENT) return;
  const parsed = parseRunRequest(ev.message);
  if (!parsed.ok) {
    reject(parsed.runId, parsed.error);
    return;
  }
  const request = parsed.request;
  const unsupported = unsupportedOption(request);
  if (unsupported !== undefined) {
    reject(request.runId, `${unsupported} not supported yet`);
    return;
  }
  const { runId } = request;
  if (activeRun !== undefined) {
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
  };
  activeRun = state;
  runAll(request, state)
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
