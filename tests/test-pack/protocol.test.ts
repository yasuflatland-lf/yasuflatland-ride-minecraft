import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  featuresFrom,
  formatRunRequest,
  LOG_TAG,
  laneIndexFrom,
  lanesFrom,
  linePrefix,
  linesOfRun,
  MANUAL_RUN_ID,
  MAX_LANES,
  MESSAGE_LIMIT,
  parseRunRequest,
  shardFrom,
  summaryOfRun,
  summaryPassed,
  TEST_EVENT,
  WHOLE_RUN,
} from "../../src/test-pack/protocol";

const runId = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/);
const twoRunIds = fc
  .tuple(runId, runId)
  .filter(([a, b]) => a !== b && !a.endsWith(b) && !b.endsWith(a));
const counts = fc.nat({ max: 6 });

function summaryLine(id: string, fail: number): string {
  return `2026 WARN ${linePrefix(id)}SUMMARY pass=${6 - fail} fail=${fail}`;
}

const shard = fc
  .integer({ min: 1, max: 99 })
  .chain((total) =>
    fc.integer({ min: 1, max: total }).map((index) => ({ index, total })),
  );

const featureTag = fc.stringMatching(/^[a-z]{1,24}(:[a-z]{1,24})?$/);
const features = fc.uniqueArray(featureTag, { minLength: 1, maxLength: 7 });
const request = fc
  .record({
    runId,
    shard,
    lanes: fc.integer({ min: 1, max: MAX_LANES }),
    at: fc.integer({ min: 0, max: MAX_LANES - 1 }),
    features: fc.option(features, { nil: undefined }),
  })
  .filter((r) => r.lanes === 1 || r.at === 0);

describe("run request grammar", () => {
  it("round trips valid requests within the message limit", () => {
    fc.assert(
      fc.property(request, (r) => {
        const message = formatRunRequest(r);
        expect(message.length).toBeLessThanOrEqual(MESSAGE_LIMIT);
        expect(parseRunRequest(message)).toEqual({ ok: true, request: r });
      }),
    );
  });

  it("accepts positional and keyed shards identically", () => {
    fc.assert(
      fc.property(runId, shard, (id, s) => {
        const expected = {
          ok: true,
          request: { runId: id, shard: s, lanes: 1, at: 0 },
        };
        expect(parseRunRequest(` ${id} ${s.index}/${s.total} `)).toEqual(
          expected,
        );
        expect(parseRunRequest(`${id} shard=${s.index}/${s.total}`)).toEqual(
          expected,
        );
      }),
    );
  });

  it("omits defaults and orders canonical keys", () => {
    fc.assert(
      fc.property(runId, (id) => {
        expect(
          formatRunRequest({
            runId: id,
            shard: { index: 1, total: 1 },
            lanes: 1,
            at: 0,
          }),
        ).toBe(id);
        expect(parseRunRequest(` ${id} `)).toEqual({
          ok: true,
          request: { runId: id, shard: WHOLE_RUN, lanes: 1, at: 0 },
        });
        expect(
          formatRunRequest({
            runId: id,
            shard: { index: 2, total: 4 },
            lanes: 1,
            at: 3,
            features: ["vehicle:suv"],
          }),
        ).toBe(`${id} shard=2/4 at=3 features=vehicle:suv`);
      }),
    );
  });

  it("reports malformed, unknown, duplicate and conflicting tokens under the supplied id", () => {
    fc.assert(
      fc.property(runId, (id) => {
        for (const [suffix, offending] of [
          ["extra", "extra"],
          ["3/2", "3/2"],
          ["unknown=1", "unknown=1"],
          ["shard=0/2", "shard=0/2"],
          ["lanes=0", "lanes=0"],
          ["at=8", "at=8"],
          ["features=", "features="],
          ["features=a,a", "features=a,a"],
          ["lanes=1 lanes=2", "lanes=2"],
          ["at=0 at=0", "at=0"],
          ["features=a features=b", "features=b"],
          ["shard=1/2 shard=2/2", "shard=2/2"],
          ["1/2 shard=1/2", "shard=1/2"],
          ["shard=1/2 1/2", "1/2"],
          ["lanes=1 1/2", "1/2"],
          ["lanes=2 at=1", "at=1"],
          ["at=1 lanes=2", "lanes=2"],
          ["lanes=1=2", "lanes=1=2"],
        ]) {
          const result = parseRunRequest(`${id} ${suffix}`);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.runId).toBe(id);
            expect(result.error).toContain(offending);
          }
        }
      }),
    );
  });

  it("uses a manual whole run for empty or invalid ids regardless of trailing tokens", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(""),
          runId.map((id) => `!${id}`),
          fc.constant("a".repeat(33)),
        ),
        (id) => {
          for (const message of [id, `${id} !bad=token`]) {
            expect(parseRunRequest(message)).toEqual({
              ok: true,
              request: {
                runId: MANUAL_RUN_ID,
                shard: WHOLE_RUN,
                lanes: 1,
                at: 0,
              },
            });
          }
        },
      ),
    );
  });

  it("allows the exact message limit and rejects longer messages even with one tag", () => {
    const r = {
      runId: "a",
      shard: WHOLE_RUN,
      lanes: 1,
      at: 0,
      features: ["a".repeat(MESSAGE_LIMIT - "a features=".length)],
    };
    expect(formatRunRequest(r)).toHaveLength(MESSAGE_LIMIT);
    expect(() =>
      formatRunRequest({ ...r, features: [`${r.features[0]}a`] }),
    ).toThrow("MESSAGE_LIMIT");
  });
});

describe("token validators", () => {
  it("accepts exactly the lane count and index ranges", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        expect(lanesFrom(String(n))).toBe(n >= 1 && n <= 8 ? n : undefined);
        expect(laneIndexFrom(String(n))).toBe(n >= 0 && n <= 7 ? n : undefined);
      }),
    );
    for (let n = 0; n <= 9; n++) {
      expect(lanesFrom(String(n))).toBe(n >= 1 && n <= 8 ? n : undefined);
      expect(laneIndexFrom(String(n))).toBe(n <= 7 ? n : undefined);
    }
    for (const text of [
      "",
      "01",
      "+1",
      "1.0",
      "1e0",
      " 1",
      "1 ",
      "NaN",
      "Infinity",
    ]) {
      expect(lanesFrom(text)).toBeUndefined();
      expect(laneIndexFrom(text)).toBeUndefined();
    }
  });

  it("accepts unique feature lists and rejects duplicates and malformed tags", () => {
    fc.assert(
      fc.property(features, (tags) => {
        expect(featuresFrom(tags.join(","))).toEqual(tags);
        expect(featuresFrom([...tags, ...tags].join(","))).toBeUndefined();
        expect(featuresFrom(`${tags.join(",")},`)).toBeUndefined();
      }),
    );
    for (const text of [
      "",
      ",",
      "a,,b",
      "A",
      "a:b:c",
      "a1",
      "a_b",
      ":a",
      "a:",
      "a, b",
      "a\n",
    ]) {
      expect(featuresFrom(text)).toBeUndefined();
    }
  });
});

describe("shardFrom", () => {
  it("rejects an index of 0, above the total, or a malformed text", () => {
    for (const text of ["0/2", "3/2", "1/0", "1-2", "1/2/3", "", " 1/2"])
      expect(shardFrom(text)).toBeUndefined();
  });
});

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

describe("TEST_EVENT", () => {
  it("is a namespaced scriptevent id outside the minecraft namespace", () => {
    expect(TEST_EVENT).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
    expect(TEST_EVENT.startsWith("minecraft:")).toBe(false);
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
