import fc from "fast-check";
import { expect, it } from "vitest";
import {
  aimOnPlane,
  decodeHost,
  encodeHost,
  isSimmering,
  nearestFreeSpot,
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

const coordinate = fc.integer({ min: -1000, max: 1000 });
const point = fc.record({ x: coordinate, z: coordinate });
it("selects the nearest free spot, breaking ties by index, or none exactly when full", () => {
  fc.assert(
    fc.property(
      fc.array(point, { maxLength: 20 }),
      fc.array(fc.boolean(), { maxLength: 20 }),
      point,
      (spots, occupied, aim) => {
        const taken = new Set(
          occupied.flatMap((value, i) => (value ? [i] : [])),
        );
        const result = nearestFreeSpot(spots, taken, aim);
        const free = spots
          .map((spot, index) => ({
            index,
            distance: (spot.x - aim.x) ** 2 + (spot.z - aim.z) ** 2,
          }))
          .filter(({ index }) => !taken.has(index));
        expect(result === undefined).toBe(free.length === 0);
        if (result === undefined) return;
        expect(taken.has(result)).toBe(false);
        for (const candidate of free) {
          const chosen = free.find(({ index }) => index === result);
          expect(chosen?.distance).toBeLessThanOrEqual(candidate.distance);
          if (chosen?.distance === candidate.distance)
            expect(result).toBeLessThanOrEqual(candidate.index);
        }
      },
    ),
  );
  expect(
    nearestFreeSpot(
      [
        { x: -7.5, z: 0 },
        { x: 7.5, z: 0 },
      ],
      new Set(),
      { x: 0, z: 0 },
    ),
  ).toBe(0);
});
it("intersects the forward ray with the plane", () => {
  fc.assert(
    fc.property(
      fc.record({ x: coordinate, y: coordinate, z: coordinate }),
      fc.record({
        x: coordinate,
        y: fc.integer({ min: 1, max: 100 }),
        z: coordinate,
      }),
      fc.integer({ min: 0, max: 100 }),
      fc.boolean(),
      (head, direction, t, downward) => {
        const dir = { ...direction, y: direction.y * (downward ? -1 : 1) };
        const planeY = head.y + dir.y * t;
        expect(aimOnPlane(head, dir, planeY)).toEqual({
          x: head.x + dir.x * t,
          y: planeY,
          z: head.z + dir.z * t,
        });
        expect(aimOnPlane(head, { ...dir, y: 0 }, planeY)).toBeUndefined();
        expect(aimOnPlane(head, dir, head.y - dir.y * (t + 1))).toBeUndefined();
      },
    ),
  );
});
