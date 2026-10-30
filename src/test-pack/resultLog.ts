import { LOG_TAG } from "./protocol.ts";

export function linePrefix(runId: string): string {
  return `${LOG_TAG} ${runId} `;
}

/** Only this run's lines count; an earlier run can still be logging. */
export function linesOfRun(lines: readonly string[], runId: string): string[] {
  const prefix = linePrefix(runId);
  return lines.filter((l) => l.includes(prefix));
}

export function summaryOfRun(
  lines: readonly string[],
  runId: string,
): string | undefined {
  const marker = `${linePrefix(runId)}SUMMARY `;
  return lines.find((l) => l.includes(marker));
}

export function summaryPassed(summary: string): boolean {
  // Judge only the first SUMMARY on the line: error text after it cannot fake a pass.
  const at = summary.indexOf("SUMMARY ");
  return (
    at !== -1 &&
    /^SUMMARY pass=\d+ fail=0(?!\d)/.test(summary.slice(at)) &&
    !/\berror=/.test(summary.slice(at))
  );
}

export type Verdict = "PASS" | "FAIL";

export interface ResultLine {
  readonly verdict: Verdict;
  readonly name: string;
  readonly ticks: number;
  readonly lane?: number;
  readonly detail: string;
}

export function formatResult(r: ResultLine): string {
  return `${r.verdict} ${r.name} ticks=${r.ticks}${r.lane === undefined ? "" : ` lane=${r.lane}`} ${r.detail}`;
}

export function resultOf(text: string): ResultLine | undefined {
  const match =
    /^(PASS|FAIL) ([a-z0-9_]+) ticks=(\d+)(?: lane=(\d+))? ([^\r\n]*)$/.exec(
      text,
    );
  if (!match) return undefined;
  return {
    verdict: match[1] as Verdict,
    name: match[2] ?? "",
    ticks: Number(match[3]),
    ...(match[4] === undefined ? {} : { lane: Number(match[4]) }),
    detail: match[5] ?? "",
  };
}

export interface PlanLine {
  readonly runs: number;
  readonly skipped: number;
  readonly unselected: number;
  readonly ticks: number;
  readonly lanes: number;
}

export function formatPlan(p: PlanLine): string {
  return `PLAN runs=${p.runs} skipped=${p.skipped} unselected=${p.unselected} ticks=${p.ticks} lanes=${p.lanes}`;
}

export function planLineOf(text: string): PlanLine | undefined {
  const match =
    /^PLAN runs=(\d+) skipped=(\d+) unselected=(\d+) ticks=(\d+) lanes=(\d+)$/.exec(
      text,
    );
  if (!match) return undefined;
  return {
    runs: Number(match[1]),
    skipped: Number(match[2]),
    unselected: Number(match[3]),
    ticks: Number(match[4]),
    lanes: Number(match[5]),
  };
}

export const READY = "READY";

export function formatSummary(s: {
  pass: number;
  fail: number;
  ticks: number;
  ms: number;
  error?: string;
}): string {
  return `SUMMARY pass=${s.pass} fail=${s.fail} ticks=${s.ticks} ms=${s.ms}${s.error === undefined ? "" : ` error=${s.error}`}`;
}
