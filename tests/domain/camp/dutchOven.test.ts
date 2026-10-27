import fc from "fast-check";
import { expect, it } from "vitest";
import {
  decodeHost,
  encodeHost,
  isSimmering,
  type OvenHost,
} from "../../../src/domain/camp/dutchOven";

const hosts: fc.Arbitrary<OvenHost> = fc.oneof(
  fc.constant({ kind: "ground" } as const),
  fc.record({
    kind: fc.constantFrom("fire_pit" as const, "camp_table" as const),
    id: fc.string({ minLength: 1 }),
    spot: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  }),
);
it("round-trips every valid host, including ids containing colons", () => {
  fc.assert(
    fc.property(hosts, (host) => {
      expect(decodeHost(encodeHost(host))).toEqual(host);
    }),
  );
});
it("simmers exactly on a fire pit", () => {
  fc.assert(
    fc.property(hosts, (host) => {
      expect(isSimmering(host)).toBe(host.kind === "fire_pit");
    }),
  );
});
it("treats unknown or malformed text as ground", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string().map((text) => `unknown:${text}`),
        fc
          .tuple(fc.constantFrom("fire_pit", "camp_table"), fc.string())
          .map(([kind, id]) => `${kind}:${id}:invalid`),
        fc.constant(""),
      ),
      (text) => {
        expect(decodeHost(text)).toEqual({ kind: "ground" });
      },
    ),
  );
  for (const text of [
    "fire_pit::0",
    "fire_pit:a:0\n",
    "fire_pit:a:-1",
    "camp_table:a:1.5",
    "fire_pit:a:9007199254740992",
  ])
    expect(decodeHost(text)).toEqual({ kind: "ground" });
});
