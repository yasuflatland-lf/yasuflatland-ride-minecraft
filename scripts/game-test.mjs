import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  deadlineMsOf,
  observe,
  watchStart,
  watchVerdict,
} from "../src/test-pack/deadline.ts";
import { isFeatureTag } from "../src/test-pack/features.ts";
import {
  CANCEL_EVENT,
  featuresFrom,
  formatRunRequest,
  LOG_TAG,
  laneIndexFrom,
  shardFrom,
  TEST_EVENT,
  WHOLE_RUN,
} from "../src/test-pack/protocol.ts";
import {
  linePrefix,
  linesOfRun,
  planLineOf,
  summaryOfRun,
  summaryPassed,
} from "../src/test-pack/resultLog.ts";

const CONTAINER = "yasuflatland-ride-bds";
const runId = randomBytes(4).toString("hex");
// GAME_TEST_SHARD=2/3 runs the second of three slices of the suite, so CI can
// spread it over parallel jobs, each with its own BDS.
const shardText = process.env.GAME_TEST_SHARD ?? "";
const shard = shardText === "" ? WHOLE_RUN : shardFrom(shardText);
if (!shard) {
  console.error(`GAME_TEST_SHARD must look like 2/3, got ${shardText}`);
  process.exit(1);
}
const atText = process.env.GAME_TEST_AT;
const at = atText === undefined ? 0 : laneIndexFrom(atText);
if (at === undefined) {
  console.error(`GAME_TEST_AT must be a valid lane index, got ${atText}`);
  process.exit(1);
}
const featuresText = process.env.GAME_TEST_FEATURES;
const features =
  featuresText === undefined ? undefined : featuresFrom(featuresText);
if (featuresText !== undefined && features === undefined) {
  console.error(
    `GAME_TEST_FEATURES must be comma-separated feature tags, got ${featuresText}`,
  );
  process.exit(1);
}
const unknownFeature = features?.find((tag) => !isFeatureTag(tag));
if (unknownFeature !== undefined) {
  console.error(`GAME_TEST_FEATURES: unknown feature ${unknownFeature}`);
  process.exit(1);
}
const message = formatRunRequest({ runId, shard, lanes: 1, at, features });
const since = new Date().toISOString();
// Write the command to bedrock_server's stdin ourselves, as Mojang's Creator
// Tools does with the process it spawns. The image's send-command cannot be
// used on Linux CI: there bedrock_server runs as the runner's UID under a root
// PID 1, and send-command's `find /proc` fails on whichever of them the exec
// user may not inspect. cmdline and the owner of /proc/<pid> are readable by
// anyone, so find the process that way, then write as its owner. The pattern
// skips this shell and mc-server-runner, whose arguments also name the binary.
const FIND_SERVER = `
for d in /proc/[0-9]*; do
  [ "\${d#/proc/}" = "$$" ] && continue
  case " $(tr '\\0' ' ' < "$d/cmdline" 2>/dev/null)" in
    *mc-server-runner*) ;;
    *" ./bedrock_server-"*) stat -c "\${d#/proc/} %u:%g" "$d"; exit 0 ;;
  esac
done
echo "bedrock_server process not found" >&2
exit 1
`;
const [serverPid, serverUser] = execFileSync(
  "docker",
  ["exec", CONTAINER, "sh", "-c", FIND_SERVER],
  { encoding: "utf8" },
)
  .trim()
  .split(" ");
function sendEvent(event, payload) {
  execFileSync("docker", [
    "exec",
    "--user",
    serverUser,
    CONTAINER,
    "sh",
    "-c",
    'echo "$1" > "/proc/$2/fd/0"',
    "sh",
    `scriptevent ${event} ${payload}`,
    serverPid,
  ]);
}

function cancel() {
  try {
    sendEvent(CANCEL_EVENT, runId);
  } catch {
    // A stopped BDS cannot receive cancellation; retain the original exit status.
  }
}

process.on("SIGINT", () => {
  cancel();
  process.exit(130);
});

let watch = watchStart(Date.now());
sendEvent(TEST_EVENT, message);
let printed = 0;
let lastLine = "none";
let plan;
while (true) {
  await sleep(3000);
  let logs = "";
  try {
    logs = execFileSync("docker", ["logs", "--since", since, CONTAINER], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // Log retrieval failure is absence of progress, so the stall watch still runs.
  }
  const lines = linesOfRun(logs.split("\n"), runId);
  for (const line of lines.slice(printed)) {
    lastLine = line.slice(line.indexOf(LOG_TAG));
    console.log(lastLine);
  }
  printed = Math.max(printed, lines.length);
  plan ??= lines
    .map((line) =>
      planLineOf(
        line.slice(line.indexOf(linePrefix(runId)) + linePrefix(runId).length),
      ),
    )
    .find((p) => p !== undefined);
  const now = Date.now();
  watch = observe(watch, now, printed, plan);
  const summary = summaryOfRun(lines, runId);
  if (summary) process.exit(summaryPassed(summary) ? 0 : 1);
  const verdict = watchVerdict(watch, now);
  if (verdict !== "running") {
    cancel();
    console.error(
      verdict === "stalled"
        ? `stalled: no new line for 60 s (last: ${lastLine})`
        : `overdue: ${plan.ticks} declared ticks allow ${deadlineMsOf(plan.ticks) / 1000} s`,
    );
    console.error(
      "if the next run reports a run in progress, use pnpm server:restart",
    );
    process.exit(1);
  }
}
