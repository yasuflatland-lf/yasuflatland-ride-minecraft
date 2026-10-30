import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LOG_TAG } from "../../src/test-pack/protocol";
import {
  formatPlan,
  formatResult,
  formatSummary,
  linePrefix,
  linesOfRun,
  planLineOf,
  resultOf,
  summaryOfRun,
  summaryPassed,
  type Verdict,
} from "../../src/test-pack/resultLog";

const runId = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/);
const twoRunIds = fc
  .tuple(runId, runId)
  .filter(([a, b]) => a !== b && !a.endsWith(b) && !b.endsWith(a));
const counts = fc.nat({ max: 6 });

function summaryLine(id: string, fail: number): string {
  return `2026 WARN ${linePrefix(id)}SUMMARY pass=${6 - fail} fail=${fail}`;
}

describe("a run reads only its own lines", () => {
  it("ignores a line that names the run id without LOG_TAG", () => {
    fc.assert(
      fc.property(runId, (id) => {
        expect(LOG_TAG.trim()).not.toBe("");
        const chat = `2026 INFO <Steve> ${id} SUMMARY pass=6 fail=0`;
        expect(linesOfRun([chat], id)).toEqual([]);
        expect(summaryOfRun([chat], id)).toBeUndefined();
      }),
    );
  });

  it("ignores the SUMMARY and results of another run", () => {
    fc.assert(
      fc.property(twoRunIds, counts, counts, ([mine, other], f1, f2) => {
        const logs = [
          `${linePrefix(other)}PASS ram_cow`,
          summaryLine(other, f1),
          `${linePrefix(mine)}FAIL ram_cow`,
          summaryLine(mine, f2),
        ];
        expect(summaryOfRun(logs, mine)).toBe(summaryLine(mine, f2));
        expect(linesOfRun(logs, mine)).toEqual([logs[2], logs[3]]);
        expect(summaryOfRun(logs.slice(0, 2), mine)).toBeUndefined();
      }),
    );
  });
});

describe("summaryPassed", () => {
  it("passes only when no test failed", () => {
    fc.assert(
      fc.property(runId, counts, (id, fail) => {
        expect(summaryPassed(summaryLine(id, fail))).toBe(fail === 0);
      }),
    );
  });

  it("ignores a fail=0 echoed in the error text", () => {
    const line = "SUMMARY pass=0 fail=1 error=bad token: x=fail=0";
    expect(summaryPassed(line)).toBe(false);
  });
});

describe("log grammar", () => {
  const count = fc.nat({ max: 1_000_000 });
  const plan = fc.record({
    runs: count,
    skipped: count,
    unselected: count,
    ticks: count,
    lanes: fc.integer({ min: 1, max: 8 }),
  });
  const result = fc.record({
    verdict: fc.constantFrom<Verdict>("PASS", "FAIL"),
    name: fc.stringMatching(/^[a-z][a-z0-9_]{0,40}$/),
    ticks: count,
    lane: fc.option(fc.integer({ min: 0, max: 7 }), { nil: undefined }),
    detail: fc.string().filter((s) => !/[\r\n]/.test(s)),
  });

  it("round trips results and preserves the legacy text without a lane", () => {
    fc.assert(
      fc.property(result, (r) => {
        expect(resultOf(formatResult(r))).toEqual(r);
        expect(formatResult({ ...r, lane: undefined })).toBe(
          `${r.verdict} ${r.name} ticks=${r.ticks} ${r.detail}`,
        );
      }),
    );
  });

  it("round trips plans and rejects other line kinds as results", () => {
    fc.assert(
      fc.property(plan, result, (p, r) => {
        expect(planLineOf(formatPlan(p))).toEqual(p);
        for (const text of [
          formatPlan(p),
          "READY",
          `SKIP ${r.name}: no player`,
          formatSummary({ pass: 1, fail: 0, ticks: 1, ms: 1 }),
          `${r.name} step chair PASS ok`,
          `${r.name} extra detail`,
        ]) {
          expect(resultOf(text)).toBeUndefined();
        }
        expect(planLineOf(formatResult(r))).toBeUndefined();
      }),
    );
  });

  it("passes a summary exactly when no failures or errors are present", () => {
    fc.assert(
      fc.property(
        count,
        counts,
        count,
        count,
        fc.option(fc.string(), { nil: undefined }),
        (pass, fail, ticks, ms, error) => {
          expect(
            summaryPassed(formatSummary({ pass, fail, ticks, ms, error })),
          ).toBe(fail === 0 && error === undefined);
        },
      ),
    );
  });
});
