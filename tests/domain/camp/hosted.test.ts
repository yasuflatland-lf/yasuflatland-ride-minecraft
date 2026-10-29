import fc from "fast-check";
import { expect, it } from "vitest";
import {
  decodeHost,
  encodeHost,
  type Host,
} from "../../../src/domain/camp/hosted";
import { TABLE_SPOTS } from "../../../src/domain/camp/spec";

const ids = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}:\n${b}`),
);
const coordinate = fc.integer().map((value) => value / 100);
const hosts: fc.Arbitrary<Host> = fc.oneof(
  fc.constant({ kind: "ground" } as const),
  fc.record({
    kind: fc.constant("fire_pit" as const),
    id: ids,
    spot: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  }),
  fc.record({
    kind: fc.constant("camp_table" as const),
    id: ids,
    at: fc.record({ x: coordinate, z: coordinate }),
  }),
);

it("round-trips hosts with hundredth coordinates and non-empty ids", () => {
  fc.assert(
    fc.property(hosts, (host) => {
      expect(decodeHost(encodeHost(host))).toEqual(host);
    }),
  );
  expect(encodeHost({ kind: "ground" })).toBe("");
  expect(decodeHost("")).toEqual({ kind: "ground" });
});

it("migrates only existing legacy table spots into fresh points", () => {
  fc.assert(
    fc.property(
      ids,
      fc.oneof(fc.constantFrom(0, 1, 2, -1), fc.integer()),
      (id, spot) => {
        const host = decodeHost(`camp_table:${id}:${spot}`);
        const at = TABLE_SPOTS[spot];
        expect(host).toEqual(
          at ? { kind: "camp_table", id, at } : { kind: "ground" },
        );
        if (host.kind === "camp_table") expect(host.at).not.toBe(at);
      },
    ),
  );
});

it("accepts only complete valid markers and never throws for arbitrary strings", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc
          .tuple(fc.constantFrom("camp_table", "fire_pit"), ids, fc.string())
          .map(([kind, id, suffix]) => `${kind}:${id}:${suffix}`),
      ),
      (text) => {
        const host = decodeHost(text);
        const separator = text.lastIndexOf(":");
        const prefix = text.slice(0, text.indexOf(":"));
        const id = text.slice(text.indexOf(":") + 1, separator);
        const suffix = text.slice(separator + 1);
        const integer = /^(0|[1-9][0-9]*)$/.exec(suffix);
        const decimal =
          /^@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/.exec(suffix);
        const validSpot =
          integer?.[0] === suffix && Number.isSafeInteger(Number(suffix));
        const validPoint =
          decimal?.[0] === suffix &&
          Number.isFinite(Number(decimal?.[1])) &&
          Number.isFinite(Number(decimal?.[2]));
        const valid =
          id.length > 0 &&
          ((prefix === "fire_pit" && validSpot) ||
            (prefix === "camp_table" &&
              (validPoint ||
                (validSpot && TABLE_SPOTS[Number(suffix)] !== undefined))));
        expect(host.kind !== "ground").toBe(Boolean(valid));
      },
    ),
  );
  for (const text of [
    "camp_table:a:@NaN,1",
    "camp_table:a:@Infinity,0",
    "camp_table::@1,2",
    "camp_table:a:@1",
    "camp_table:a:@1,2\n",
    "camp_table:a:@1e2,0",
    `camp_table:a:@${"9".repeat(400)},0`,
    "fire_pit:a:-1",
    "fire_pit:a:1.5",
    "fire_pit::0",
    "fire_pit:a:0\n",
    "fire_pit:a:9007199254740992",
  ])
    expect(decodeHost(text)).toEqual({ kind: "ground" });
});

it("writes finite doubles as decimal coordinates rounded to at most two places", () => {
  const finite = fc.oneof(
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(-0, -0.001, 1e21, -1e21, Number.MAX_VALUE),
  );
  fc.assert(
    fc.property(finite, finite, (x, z) => {
      const encoded = encodeHost({ kind: "camp_table", id: "a", at: { x, z } });
      expect(encoded).toMatch(
        /^camp_table:a:@-?[0-9]+(?:\.[0-9]{1,2})?,-?[0-9]+(?:\.[0-9]{1,2})?$/,
      );
      const rounded = (value: number) => Number(value.toFixed(2)) || 0;
      expect(decodeHost(encoded)).toEqual({
        kind: "camp_table",
        id: "a",
        at: { x: rounded(x), z: rounded(z) },
      });
      expect(encodeHost(decodeHost(encoded))).toBe(encoded);
    }),
  );
});
