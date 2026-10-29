import fc from "fast-check";
import { expect, it } from "vitest";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
  TABLE_SPOTS,
  TABLE_TOP_HALF_PX,
  TABLE_TOP_LIMIT,
} from "../../../src/domain/camp/spec";
import {
  type Footprint,
  placeOnTop,
  type TopItem,
} from "../../../src/domain/camp/tabletop";

const coordinate = fc.double({ min: -40, max: 40, noNaN: true });
const point = fc.record({ x: coordinate, z: coordinate });
const size = fc.double({ min: 0.25, max: 20, noNaN: true });
const footprint = fc.record({ halfX: size, halfZ: size });
const item = fc.record({ at: point, footprint });
const items = fc.array(item, { maxLength: 8 });
const limit = fc.integer({ min: 1, max: 10 });

function overlaps(a: TopItem, b: TopItem): boolean {
  return (
    Math.abs(a.at.x - b.at.x) < a.footprint.halfX + b.footprint.halfX &&
    Math.abs(a.at.z - b.at.z) < a.footprint.halfZ + b.footprint.halfZ
  );
}

it("keeps accepted footprints inside the top and clear of existing items", () => {
  fc.assert(
    fc.property(
      footprint,
      limit,
      items,
      point,
      footprint,
      (top, cap, existing, aim, shape) => {
        const result = placeOnTop(top, cap, existing, aim, shape);
        if (!result.ok) return;
        expect(result.at.x).toBeGreaterThanOrEqual(-top.halfX + shape.halfX);
        expect(result.at.x).toBeLessThanOrEqual(top.halfX - shape.halfX);
        expect(result.at.z).toBeGreaterThanOrEqual(-top.halfZ + shape.halfZ);
        expect(result.at.z).toBeLessThanOrEqual(top.halfZ - shape.halfZ);
        for (const other of existing)
          expect(overlaps({ at: result.at, footprint: shape }, other)).toBe(
            false,
          );
      },
    ),
  );
});

it("returns an already valid aim unchanged", () => {
  const topSize = fc.double({ min: 8, max: 20, noNaN: true });
  const itemSize = fc.double({ min: 0.25, max: 4, noNaN: true });
  const aimCoordinate = fc.double({ min: -4, max: 4, noNaN: true });
  fc.assert(
    fc.property(
      fc.record({ halfX: topSize, halfZ: topSize }),
      fc.record({ halfX: itemSize, halfZ: itemSize }),
      fc.record({ x: aimCoordinate, z: aimCoordinate }),
      items,
      (top, shape, aim, candidates) => {
        const existing = candidates.filter(
          (other) => !overlaps({ at: aim, footprint: shape }, other),
        );
        const result = placeOnTop(
          top,
          existing.length + 1,
          existing,
          aim,
          shape,
        );
        expect(result).toEqual({ ok: true, at: aim });
        if (!result.ok) return;
        expect(result.at.x).toBe(aim.x);
        expect(result.at.z).toBe(aim.z);
      },
    ),
  );
});

it("clamps idempotently", () => {
  fc.assert(
    fc.property(
      footprint,
      limit,
      items,
      point,
      footprint,
      (top, cap, existing, aim, shape) => {
        const result = placeOnTop(top, cap, existing, aim, shape);
        if (!result.ok) return;
        expect(placeOnTop(top, cap, existing, result.at, shape)).toEqual(
          result,
        );
      },
    ),
  );
});

it("refuses full tops before checking size or overlap, whatever the aim", () => {
  fc.assert(
    fc.property(
      footprint,
      items,
      point,
      footprint,
      (top, existing, aim, shape) => {
        for (const cap of [existing.length, Math.max(0, existing.length - 1)])
          expect(placeOnTop(top, cap, existing, aim, shape)).toEqual({
            ok: false,
            reason: "full",
          });
      },
    ),
  );
});

it("does not depend on the order of existing items", () => {
  fc.assert(
    fc.property(
      footprint,
      limit,
      items,
      point,
      footprint,
      (top, cap, existing, aim, shape) => {
        expect(
          placeOnTop(top, cap, [...existing].reverse(), aim, shape),
        ).toEqual(placeOnTop(top, cap, existing, aim, shape));
      },
    ),
  );
});

it("refuses a footprint larger than the top on either axis before overlap", () => {
  fc.assert(
    fc.property(footprint, point, size, (top, aim, excess) => {
      for (const axis of ["halfX", "halfZ"] as const) {
        const shape: Footprint = { ...top, [axis]: top[axis] + excess };
        expect(
          placeOnTop(top, 2, [{ at: aim, footprint: top }], aim, shape),
        ).toEqual({ ok: false, reason: "tooBig" });
      }
    }),
  );
});

it("accepts Dutch ovens at both old table spots", () => {
  const existing: TopItem[] = [];
  for (const aim of TABLE_SPOTS) {
    expect(
      placeOnTop(
        TABLE_TOP_HALF_PX,
        TABLE_TOP_LIMIT,
        existing,
        aim,
        DUTCH_OVEN_FOOTPRINT_PX,
      ),
    ).toEqual({ ok: true, at: aim });
    existing.push({ at: aim, footprint: DUTCH_OVEN_FOOTPRINT_PX });
  }
});

it("allows touching edges on either axis but refuses a 1e-6 px overlap without nudging", () => {
  const shape = GAS_LANTERN_FOOTPRINT_PX;
  const top = { halfX: 20, halfZ: 20 };
  const existing = [{ at: { x: 0, z: 0 }, footprint: shape }];
  for (const axis of ["x", "z"] as const) {
    const aim = { x: 0, z: 0, [axis]: 7.5 };
    expect(placeOnTop(top, TABLE_TOP_LIMIT, existing, aim, shape)).toEqual({
      ok: true,
      at: aim,
    });
    expect(
      placeOnTop(
        top,
        TABLE_TOP_LIMIT,
        existing,
        { ...aim, [axis]: 7.5 - 1e-6 },
        shape,
      ),
    ).toEqual({ ok: false, reason: "overlap" });
  }
});

it("checks overlap at the clamped point", () => {
  expect(
    placeOnTop(
      TABLE_TOP_HALF_PX,
      TABLE_TOP_LIMIT,
      [{ at: { x: 9.25, z: 0 }, footprint: DUTCH_OVEN_FOOTPRINT_PX }],
      { x: 40, z: 0 },
      DUTCH_OVEN_FOOTPRINT_PX,
    ),
  ).toEqual({ ok: false, reason: "overlap" });
});
