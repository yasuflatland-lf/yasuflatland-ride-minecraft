import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  outcomeOfSteps,
  runCourse,
  type StepResult,
  stepLines,
} from "../../src/test-pack/outcome";

const outcomes = fc
  .array(
    fc.record({
      pass: fc.boolean(),
      detail: fc.string(),
      lines: fc.array(fc.string(), { maxLength: 3 }),
    }),
    { maxLength: 20 },
  )
  .map((values) =>
    values.map((value, i) => ({ ...value, name: `check_${i}` })),
  );

describe("outcomeOfSteps", () => {
  it("passes with no expected steps or results", () => {
    expect(outcomeOfSteps([], [])).toEqual({
      pass: true,
      detail: "steps=0/0",
      lines: [],
    });
  });

  it("reports unexpected names even when results are streamed", () => {
    fc.assert(
      fc.property(outcomes, fc.boolean(), (results, streamed) => {
        const passing = results.map((r) => ({ ...r, pass: true }));
        const outcome = outcomeOfSteps(
          results.map((r) => r.name),
          [...passing, { name: "unexpected", pass: true, detail: "extra" }],
          { streamed },
        );
        expect(outcome.pass).toBe(false);
        expect(outcome.detail).toBe(
          `steps=${results.length}/${results.length}`,
        );
        expect(outcome.lines).toContain("step unexpected UNEXPECTED");
      }),
    );
  });

  it("reports duplicate names even when results are streamed", () => {
    fc.assert(
      fc.property(
        outcomes.filter((results) => results.length > 0),
        fc.nat(),
        fc.boolean(),
        (results, index, streamed) => {
          const passing = results.map((r) => ({ ...r, pass: true }));
          const duplicate = passing[index % passing.length];
          if (!duplicate) throw new Error("Expected a result to duplicate");
          const outcome = outcomeOfSteps(
            results.map((r) => r.name),
            [...passing, duplicate],
            { streamed },
          );
          expect(outcome.pass).toBe(false);
          expect(outcome.detail).toBe(
            `steps=${results.length - 1}/${results.length}`,
          );
          expect(outcome.lines).toContain(`step ${duplicate.name} DUPLICATE`);
        },
      ),
    );
  });

  it("requires exactly one passing result for every expected name and preserves run order", () => {
    fc.assert(
      fc.property(outcomes, (results) => {
        const expected = results.map((r) => r.name);
        const reversed = [...results].reverse();
        const outcome = outcomeOfSteps(expected, reversed);
        expect(outcome.pass).toBe(results.every((r) => r.pass));
        expect(outcome.lines).toEqual(
          reversed.flatMap((r) => [
            `step ${r.name} ${r.pass ? "PASS" : "FAIL"} ${r.detail}`,
            ...r.lines.map((line) => `${r.name} ${line}`),
          ]),
        );
        const failed = reversed.find((r) => !r.pass);
        expect(outcome.detail).toBe(
          `steps=${results.filter((r) => r.pass).length}/${expected.length}${failed ? `; first_fail=${failed.name}: ${failed.detail}` : ""}`,
        );
        expect(
          outcomeOfSteps(expected, reversed, { streamed: true }).lines,
        ).toEqual([]);
        expect(
          outcomeOfSteps(expected, [
            ...results,
            { name: "unexpected", pass: true, detail: "" },
          ]).pass,
        ).toBe(false);
        for (const r of results) {
          expect(outcomeOfSteps(expected, [...results, r]).pass).toBe(false);
          const missing = outcomeOfSteps(
            expected,
            results.filter((other) => other !== r),
          );
          expect(missing.pass).toBe(false);
          expect(missing.lines?.at(-1)).toBe(`step ${r.name} MISSING`);
        }
      }),
    );
  });
});

describe("runCourse", () => {
  it("passes an empty course", async () => {
    expect(await runCourse([])).toEqual({
      pass: true,
      detail: "steps=0/0",
      lines: [],
    });
  });

  it("retains only the results whose sink throws", async () => {
    await fc.assert(
      fc.asyncProperty(outcomes, async (results) => {
        const outcome = await runCourse(
          results.map((r) => ({ name: r.name, run: async () => r })),
          {
            stopOnFail: false,
            onStep: (r) => {
              if (!r.pass) throw new Error("sink unavailable");
            },
          },
        );
        expect(outcome.pass).toBe(results.every((r) => r.pass));
        expect(outcome.lines).toEqual(
          results
            .filter((r) => !r.pass)
            .flatMap((r) => [
              ...stepLines(r),
              `sink failed for ${r.name}: Error: sink unavailable`,
            ]),
        );
      }),
    );
  });

  it("runs in order, stops by default, and streams each executed result immediately", async () => {
    await fc.assert(
      fc.asyncProperty(
        outcomes,
        fc.boolean(),
        fc.boolean(),
        async (results, stopOnFail, streamed) => {
          const executed: string[] = [];
          const received: StepResult[] = [];
          const sinkObservations: { name: string; executed: string[] }[] = [];
          const runObservations: { received: number; executed: number }[] = [];
          const firstFail = results.findIndex((r) => !r.pass);
          const count =
            stopOnFail && firstFail >= 0 ? firstFail + 1 : results.length;
          const ran = results.slice(0, count);
          const skipped = results.slice(count);
          const outcome = await runCourse(
            results.map((r) => ({
              name: r.name,
              run: async () => {
                runObservations.push({
                  received: received.length,
                  executed: executed.length,
                });
                executed.push(r.name);
                return r;
              },
            })),
            {
              ...(stopOnFail ? {} : { stopOnFail: false }),
              ...(streamed
                ? {
                    onStep: (r: StepResult) => {
                      sinkObservations.push({
                        name: r.name,
                        executed: [...executed],
                      });
                      received.push(r);
                    },
                  }
                : {}),
            },
          );
          expect(executed).toEqual(ran.map((r) => r.name));
          expect(received).toEqual(streamed ? ran : []);
          expect(runObservations).toEqual(
            ran.map((_, index) => ({
              received: streamed ? index : 0,
              executed: index,
            })),
          );
          expect(sinkObservations).toEqual(
            streamed
              ? ran.map((r, index) => ({
                  name: r.name,
                  executed: ran.slice(0, index + 1).map((step) => step.name),
                }))
              : [],
          );
          expect(outcome.pass).toBe(results.every((r) => r.pass));
          expect(outcome.lines).toEqual([
            ...(streamed ? [] : ran.flatMap(stepLines)),
            ...skipped.map(
              (r) => `step ${r.name} SKIP after ${results[firstFail]?.name}`,
            ),
          ]);
        },
      ),
    );
  });

  it("resolves throwing steps as failures and applies the stop policy", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.boolean(),
        async (message, stopOnFail) => {
          let later = 0;
          const outcome = await runCourse(
            [
              {
                name: "throws",
                run: async () => {
                  throw new Error(message);
                },
              },
              {
                name: "later",
                run: async () => {
                  later++;
                  return { pass: true, detail: "done" };
                },
              },
            ],
            { stopOnFail },
          );
          expect(outcome.pass).toBe(false);
          expect(outcome.detail).toBe(
            `steps=${stopOnFail ? 0 : 1}/2; first_fail=throws: error: ${new Error(message)}`,
          );
          expect(later).toBe(stopOnFail ? 0 : 1);
          expect(outcome.lines).toEqual([
            `step throws FAIL error: ${new Error(message)}`,
            stopOnFail
              ? "step later SKIP after throws"
              : "step later PASS done",
          ]);
        },
      ),
    );
  });

  it("does not let a throwing sink interrupt execution", async () => {
    await fc.assert(
      fc.asyncProperty(outcomes, async (results) => {
        let calls = 0;
        const outcome = await runCourse(
          results.map((r) => ({ name: r.name, run: async () => r })),
          {
            stopOnFail: false,
            onStep: () => {
              calls++;
              throw new Error("sink unavailable");
            },
          },
        );
        expect(calls).toBe(results.length);
        expect(outcome.pass).toBe(results.every((r) => r.pass));
        expect(outcome.lines).toEqual(
          results.flatMap((r) => [
            ...stepLines(r),
            `sink failed for ${r.name}: Error: sink unavailable`,
          ]),
        );
      }),
    );
  });
});
