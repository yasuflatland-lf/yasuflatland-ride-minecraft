// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { system, world } from "@minecraft/server";
import { setupArena } from "./arena";
import { CATALOG } from "./catalog";
import type { Outcome } from "./outcome";
import { coverageGaps, planOf } from "./plan";
import {
  LOG_TAG,
  linePrefix,
  parseRunRequest,
  type RunRequest,
  TEST_EVENT,
} from "./protocol";
import { SCENARIOS } from "./scenarios/index";

function log(runId: string, msg: string): void {
  console.warn(`${linePrefix(runId)}${msg}`);
}

async function runAll({ runId, shard }: RunRequest): Promise<void> {
  const { missing, extra } = coverageGaps(
    CATALOG.map((spec) => spec.name),
    Object.keys(SCENARIOS),
  );
  if (missing.length > 0 || extra.length > 0) {
    log(
      runId,
      `SUMMARY pass=0 fail=1 error=catalog mismatch missing=${missing.join(",")} extra=${extra.join(",")}`,
    );
    return;
  }
  const a = await setupArena();
  const plan = planOf(CATALOG, {
    shard,
    playerConnected: world.getAllPlayers().length > 0,
  });
  for (const { name, reason } of plan.skipped)
    log(runId, `SKIP ${name}: ${reason}`);
  let passed = 0;
  const lines: string[] = [];
  for (const { name } of plan.runs) {
    const start = system.currentTick;
    let outcome: Outcome;
    try {
      const run = SCENARIOS[name];
      if (!run) throw new Error(`scenario not registered: ${name}`);
      outcome = await run(a);
    } catch (e) {
      outcome = { pass: false, detail: `error: ${e}` };
    }
    if (outcome.pass) passed++;
    // ticks= is what rebalancing the CI shards needs.
    lines.push(
      `${outcome.pass ? "PASS" : "FAIL"} ${name} ticks=${system.currentTick - start} ${outcome.detail}`,
    );
    for (const line of outcome.lines ?? []) lines.push(`${name} ${line}`);
  }
  for (const line of lines) log(runId, line);
  log(runId, `SUMMARY pass=${passed} fail=${plan.runs.length - passed}`);
}

function unsupportedOption(request: RunRequest): string | undefined {
  if (request.at !== 0) return "at";
  if (request.features !== undefined) return "features";
  if (request.lanes !== 1) return "lanes";
  return undefined;
}

// Two runs would share the arena and kill each other's cars in setupArena.
let activeRun: string | undefined;

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== TEST_EVENT) return;
  const parsed = parseRunRequest(ev.message);
  if (!parsed.ok) {
    log(parsed.runId, `SUMMARY pass=0 fail=1 error=${parsed.error}`);
    return;
  }
  const request = parsed.request;
  const unsupported = unsupportedOption(request);
  if (unsupported !== undefined) {
    log(
      request.runId,
      `SUMMARY pass=0 fail=1 error=${unsupported} not supported yet`,
    );
    return;
  }
  const { runId } = request;
  if (activeRun !== undefined) {
    log(runId, `SUMMARY pass=0 fail=1 error=run ${activeRun} in progress`);
    return;
  }
  activeRun = runId;
  runAll(request)
    .catch((e) => log(runId, `SUMMARY pass=0 fail=1 error=${e}`))
    .finally(() => {
      activeRun = undefined;
    });
});
console.warn(`${LOG_TAG} loaded`);
