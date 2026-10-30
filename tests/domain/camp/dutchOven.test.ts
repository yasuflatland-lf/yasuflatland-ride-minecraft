import fc from "fast-check";
import { expect, it } from "vitest";
import {
  aimOnPlane,
  initialSimmering,
} from "../../../src/domain/camp/dutchOven";
import type { Host } from "../../../src/domain/camp/hosted";

it("initially simmers exactly on a fire pit", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant({ kind: "ground" } as const),
        fc.record({
          kind: fc.constant("fire_pit" as const),
          id: fc.string({ minLength: 1 }),
          spot: fc.nat(),
        }),
        fc.record({
          kind: fc.constant("camp_table" as const),
          id: fc.string({ minLength: 1 }),
          at: fc.record({ x: fc.integer(), z: fc.integer() }),
        }),
      ),
      (host: Host) => {
        expect(initialSimmering(host)).toBe(host.kind === "fire_pit");
      },
    ),
  );
});

const coordinate = fc.integer({ min: -1000, max: 1000 });
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
