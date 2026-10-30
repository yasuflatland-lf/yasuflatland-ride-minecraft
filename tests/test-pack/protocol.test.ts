import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  defaultLanesOf,
  featuresFrom,
  formatRunRequest,
  LOCAL_DEFAULT_LANES,
  laneIndexFrom,
  lanesFrom,
  MANUAL_RUN_ID,
  MAX_LANES,
  MESSAGE_LIMIT,
  parseRunRequest,
  shardFrom,
  TEST_EVENT,
  WHOLE_RUN,
} from "../../src/test-pack/protocol";

const runId = fc.stringMatching(/^[A-Za-z0-9_-]{1,32}$/);
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

describe("defaultLanesOf", () => {
  const value = fc.oneof(fc.string(), fc.constant(undefined), fc.constant(""));
  const context = fc.record({ CI: value, GAME_TEST_SHARD: value });
  const unsetLanes = value.filter(
    (text) => lanesFrom(text ?? "") === undefined,
  );

  it("lets valid explicit lanes win over CI and shard defaults", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: MAX_LANES }),
        context,
        (lanes, env) => {
          expect(
            defaultLanesOf({ ...env, GAME_TEST_LANES: String(lanes) }),
          ).toBe(lanes);
        },
      ),
    );
  });

  it("uses one lane for nonempty CI or shard values, otherwise the local default", () => {
    fc.assert(
      fc.property(context, unsetLanes, (env, GAME_TEST_LANES) => {
        expect(defaultLanesOf({ ...env, GAME_TEST_LANES })).toBe(
          env.CI || env.GAME_TEST_SHARD ? 1 : LOCAL_DEFAULT_LANES,
        );
      }),
    );
  });

  it("always returns a lane count from 1 to 8", () => {
    fc.assert(
      fc.property(context, value, (env, GAME_TEST_LANES) => {
        const lanes = defaultLanesOf({ ...env, GAME_TEST_LANES });
        expect(Number.isInteger(lanes)).toBe(true);
        expect(lanes).toBeGreaterThanOrEqual(1);
        expect(lanes).toBeLessThanOrEqual(MAX_LANES);
      }),
    );
  });
});

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

describe("TEST_EVENT", () => {
  it("is a namespaced scriptevent id outside the minecraft namespace", () => {
    expect(TEST_EVENT).toMatch(/^[a-z0-9_]+:[a-z0-9_]+$/);
    expect(TEST_EVENT.startsWith("minecraft:")).toBe(false);
  });
});
