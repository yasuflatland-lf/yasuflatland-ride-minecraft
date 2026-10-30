import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AREA_MARGIN,
  areaBounds,
  type Bounds,
  chunksOf,
  inside,
  LANE_STRIDE,
  LOCAL_ARENA,
  laneOf,
  SERIES_AREAS,
  toLocal,
  toWorld,
  worldBounds,
} from "../../src/test-pack/lane";
import { MAX_LANES } from "../../src/test-pack/protocol";

const index = fc.integer({ min: 0, max: MAX_LANES - 1 });
const lane = index.map(laneOf);
// Eighth-block coordinates cover sub-block positions without rounding on translation.
const coordinate = fc.integer({ min: -16000, max: 16000 }).map((n) => n / 8);
const position = fc.record({
  x: coordinate,
  y: coordinate,
  z: coordinate,
  marker: fc.string(),
});
const bounds = fc
  .tuple(
    fc.integer({ min: -1000, max: 1000 }),
    fc.integer({ min: -1000, max: 1000 }),
    fc.nat({ max: 300 }),
    fc.nat({ max: 300 }),
  )
  .map(
    ([x, z, width, depth]): Bounds => ({
      minX: x,
      maxX: x + width,
      minZ: z,
      maxZ: z + depth,
    }),
  );
const distinctLanes = fc
  .tuple(lane, lane)
  .filter(([a, b]) => a.index !== b.index);

function overlaps(a: Bounds, b: Bounds): boolean {
  return (
    a.minX <= b.maxX && b.minX <= a.maxX && a.minZ <= b.maxZ && b.minZ <= a.maxZ
  );
}

describe("lane frame", () => {
  it("round trips positions and preserves height and extra fields", () => {
    fc.assert(
      fc.property(lane, position, (l, p) => {
        const world = toWorld(l, p);
        expect(world).toEqual({
          ...p,
          x: p.x + l.origin.x,
          z: p.z + l.origin.z,
        });
        expect(toLocal(l, world)).toEqual(p);
        expect(world.y).toBe(p.y);
        expect(world.marker).toBe(p.marker);
      }),
    );
  });

  it("keeps lane zero coordinates identical", () => {
    fc.assert(
      fc.property(position, (p) => {
        expect(toWorld(laneOf(0), p)).toEqual(p);
        expect(toLocal(laneOf(0), p)).toEqual(p);
      }),
    );
  });

  it("aligns origins to chunks and keeps the far unload area clear", () => {
    fc.assert(
      fc.property(lane, (l) => {
        expect(l.origin).toEqual({ x: l.index * LANE_STRIDE, z: 0 });
        expect(l.origin.x % 16).toBe(0);
        expect(areaBounds(l).maxX).toBeLessThan(1900);
      }),
    );
  });

  it("uses 80 chunks per area, within the engine limit of 100", () => {
    fc.assert(
      fc.property(lane, (l) => {
        expect(chunksOf(areaBounds(l))).toBe(80);
        expect(chunksOf(areaBounds(l))).toBeLessThanOrEqual(100);
      }),
    );
  });

  it("counts all intersected chunks, including negative coordinates and edges", () => {
    fc.assert(
      fc.property(bounds, (b) => {
        const xs = new Set<number>();
        const zs = new Set<number>();
        for (let x = b.minX; x <= b.maxX; x++) xs.add(Math.floor(x / 16));
        for (let z = b.minZ; z <= b.maxZ; z++) zs.add(Math.floor(z / 16));
        expect(chunksOf(b)).toBe(xs.size * zs.size);
      }),
    );
  });

  it("translates bounds and retains a margin around each arena", () => {
    fc.assert(
      fc.property(lane, bounds, (l, b) => {
        const world = worldBounds(l, b);
        expect(world).toEqual({
          minX: b.minX + l.origin.x,
          maxX: b.maxX + l.origin.x,
          minZ: b.minZ + l.origin.z,
          maxZ: b.maxZ + l.origin.z,
        });
        const arena = worldBounds(l, LOCAL_ARENA);
        const area = areaBounds(l);
        expect(area).toEqual({
          minX: arena.minX - AREA_MARGIN,
          maxX: arena.maxX + AREA_MARGIN,
          minZ: arena.minZ - AREA_MARGIN,
          maxZ: arena.maxZ + AREA_MARGIN,
        });
        for (const x of [arena.minX, arena.maxX + 1])
          for (const z of [arena.minZ, arena.maxZ + 1])
            expect(inside(area, { x, z }, 0)).toBe(true);
      }),
    );
  });

  it("keeps different areas disjoint and each arena outside other areas", () => {
    fc.assert(
      fc.property(distinctLanes, ([a, b]) => {
        expect(overlaps(areaBounds(a), areaBounds(b))).toBe(false);
        expect(overlaps(worldBounds(a, LOCAL_ARENA), areaBounds(b))).toBe(
          false,
        );
        expect(overlaps(worldBounds(b, LOCAL_ARENA), areaBounds(a))).toBe(
          false,
        );
      }),
    );
  });

  it("names every series area uniquely and keeps the lane zero name", () => {
    const lanes = Array.from({ length: MAX_LANES }, (_, i) => laneOf(i));
    expect(lanes[0]?.tickingArea).toBe("yasu_ride_arena");
    expect(new Set(lanes.map((l) => l.tickingArea)).size).toBe(MAX_LANES);
    expect(SERIES_AREAS).toHaveLength(MAX_LANES + 1);
    expect(new Set(SERIES_AREAS).size).toBe(MAX_LANES + 1);
    for (const l of lanes) expect(SERIES_AREAS).toContain(l.tickingArea);
    expect(SERIES_AREAS).toContain("yasu_ride_unload_spike");
    fc.assert(
      fc.property(lane, (l) => {
        if (l.index > 0)
          expect(l.tickingArea).toBe(`yasu_ride_arena_${l.index}`);
      }),
    );
  });

  it("agrees with explicit inclusive block bounds for body extents", () => {
    fc.assert(
      fc.property(
        bounds,
        position,
        fc.nat({ max: 240 }).map((n) => n / 8),
        (b, p, halfWidth) => {
          expect(inside(b, p, halfWidth)).toBe(
            p.x - halfWidth >= b.minX &&
              p.x + halfWidth <= b.maxX + 1 &&
              p.z - halfWidth >= b.minZ &&
              p.z + halfWidth <= b.maxZ + 1,
          );
        },
      ),
    );
    fc.assert(
      fc.property(bounds, (b) => {
        for (const x of [b.minX, b.maxX + 1])
          for (const z of [b.minZ, b.maxZ + 1])
            expect(inside(b, { x, z }, 0)).toBe(true);
        expect(inside(b, { x: b.minX - 0.125, z: b.minZ }, 0)).toBe(false);
        expect(inside(b, { x: b.minX, z: b.minZ - 0.125 }, 0)).toBe(false);
        expect(inside(b, { x: b.maxX + 1.125, z: b.maxZ }, 0)).toBe(false);
        expect(inside(b, { x: b.maxX, z: b.maxZ + 1.125 }, 0)).toBe(false);
      }),
    );
  });

  it("rejects every index outside the integer range", () => {
    fc.assert(
      fc.property(
        fc
          .double()
          .filter((n) => !Number.isInteger(n) || n < 0 || n >= MAX_LANES),
        (n) => {
          expect(() => laneOf(n)).toThrow();
        },
      ),
    );
    fc.assert(
      fc.property(index, (n) => {
        expect(laneOf(n).index).toBe(n);
      }),
    );
  });
});
