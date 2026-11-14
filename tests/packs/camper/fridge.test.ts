import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAMPER_FURNITURE } from "../../../src/domain/vehicle/kinds/camper/furniture";
import {
  bone,
  type Cube,
  end,
  readPng,
  slotXZ,
  standingItems,
  swatchUv,
  turn,
} from "./helpers";

const fridgeCubes = () => {
  const areas = JSON.parse(
    readFileSync("tests/packs/fixtures/camper-areas.json", "utf8"),
  ) as { fridge: Record<string, [number, number]> };
  return Object.entries(areas.fridge).flatMap(([name, [first, last]]) =>
    (bone(name).cubes ?? []).slice(first, last + 1),
  );
};

describe("fridge surface continuity", () => {
  it("joins slab slices without cracks and keeps corner steps below 0.15 px", () => {
    for (const name of ["fridge_top_door", "fridge_bottom_door"]) {
      const slabs = (bone(name).cubes ?? [])
        .filter((c) => (c.origin[0] ?? 0) < -8.75 && end(c, 0) > -8.75)
        .sort((a, b) => (a.origin[1] ?? 0) - (b.origin[1] ?? 0));
      expect(slabs.length).toBeGreaterThan(0);
      for (const [i, slab] of slabs.entries()) {
        const next = slabs[i + 1];
        if (!next) continue;
        expect(
          Math.abs(end(slab, 1) - (next.origin[1] ?? 0)),
          name,
        ).toBeLessThanOrEqual(1e-6);
        for (const z of [0, 1]) {
          const edge = (c: Cube) => (c.origin[2] ?? 0) + z * (c.size[2] ?? 0);
          expect(Math.abs(edge(slab) - edge(next)), name).toBeLessThan(0.15);
        }
      }
    }
  });

  it("has no same-direction coplanar overlapping faces, including between fridge bones", () => {
    const cubes = fridgeCubes();
    const conflicts: string[] = [];
    for (const [i, a] of cubes.entries()) {
      for (const [j, b] of cubes.slice(0, i).entries()) {
        for (let axis = 0; axis < 3; axis++) {
          for (const side of [0, 1]) {
            const plane = (c: Cube) =>
              (c.origin[axis] ?? 0) + side * (c.size[axis] ?? 0);
            if (Math.abs(plane(a) - plane(b)) > 1e-6) continue;
            if (
              [0, 1, 2].every(
                (k) =>
                  k === axis ||
                  Math.min(end(a, k), end(b, k)) -
                    Math.max(a.origin[k] ?? 0, b.origin[k] ?? 0) >
                    1e-6,
              )
            )
              conflicts.push(`${i}/${j} axis ${axis} side ${side}`);
          }
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("keeps every face's filtering footprint inside a light opaque texel", () => {
    const atlas = readPng("textures/entity/yasu_ride/camper");
    const bad: string[] = [];
    for (const [i, cube] of fridgeCubes().entries()) {
      for (const [name, face] of Object.entries(cube.uv)) {
        const [u = 0, v = 0] = face.uv;
        const [du = 0, dv = 0] = face.uv_size;
        // Linear filtering reaches half a texel beyond each UV endpoint.
        for (
          let y = Math.floor(Math.min(v, v + dv) - 0.5 + 1e-6);
          y <= Math.ceil(Math.max(v, v + dv) - 0.5 - 1e-6);
          y++
        ) {
          for (
            let x = Math.floor(Math.min(u, u + du) - 0.5 + 1e-6);
            x <= Math.ceil(Math.max(u, u + du) - 0.5 - 1e-6);
            x++
          ) {
            const offset = 4 * (y * atlas.width + x);
            const rgba = [...atlas.pixels.subarray(offset, offset + 4)];
            if (
              rgba.length !== 4 ||
              rgba.slice(0, 3).some((c) => c < 160) ||
              rgba[3] !== 255
            )
              bad.push(`${i} ${name}: ${x},${y} ${rgba}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

const corners = (cube: Pick<Cube, "origin" | "size">) =>
  [0, 1].flatMap((x) =>
    [0, 1].flatMap((y) =>
      [0, 1].map((z) =>
        [x, y, z].map(
          (n, axis) => (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
        ),
      ),
    ),
  );

// Separating axes of both horizontal rectangles, plus their vertical intervals.
const overlaps = (a: number[][], b: number[][]) => {
  const separated = (axis: number[]) => {
    const project = (points: number[][]) =>
      points.map((p) =>
        axis.reduce((sum, value, i) => sum + value * (p[i] ?? 0), 0),
      );
    const one = project(a);
    const two = project(b);
    return (
      Math.max(...one) <= Math.min(...two) + 0.001 ||
      Math.max(...two) <= Math.min(...one) + 0.001
    );
  };
  if (separated([0, 1, 0])) return false;
  for (const points of [a, b]) {
    const p = points[0] ?? [];
    for (const index of [1, 4]) {
      const q = points[index] ?? [];
      const dx = (q[0] ?? 0) - (p[0] ?? 0);
      const dz = (q[2] ?? 0) - (p[2] ?? 0);
      const length = Math.hypot(dx, dz);
      if (length > 0 && separated([-dz / length, 0, dx / length])) return false;
    }
  }
  return true;
};

describe("camper furniture model (ADR 0093)", () => {
  it("hinges both fridge doors at the fridge's front end on its aisle face, the shorter top door over the taller bottom one, and swings each open into the aisle cell beside the fridge (ADR 0123)", () => {
    const heights: number[] = [];
    for (const name of ["fridge_bottom_door", "fridge_top_door"]) {
      const door = bone(name);
      expect(door.pivot).toEqual([-8.3, 0, -23.3]);
      expect(door.parent).toBe("body");
      expect(door.rotation).toBeUndefined();
      expect(door.cubes?.length).toBeGreaterThan(0);
      const ys: number[] = [];
      for (const cube of door.cubes ?? [])
        for (const corner of [0, 1].flatMap((i) =>
          [0, 1].flatMap((j) =>
            [0, 1].map((k) =>
              [i, j, k].map(
                (n, axis) =>
                  (cube.origin[axis] ?? 0) + n * (cube.size[axis] ?? 0),
              ),
            ),
          ),
        )) {
          const [cx = 0, cy = 0, cz = 0] = corner;
          ys.push(cy);
          // Shut, the door covers the fridge's aisle face, in the fridge's cell row (z = 1).
          // The door's shallow bins reach into the compartment behind the slab.
          expect(cx, name).toBeGreaterThanOrEqual(-10.1 - 1e-6);
          expect(cx, name).toBeLessThanOrEqual(-7.5);
          expect(cz, name).toBeGreaterThanOrEqual(-24);
          expect(cz, name).toBeLessThanOrEqual(-8);
          expect(cy, name).toBeGreaterThanOrEqual(16);
          expect(cy, name).toBeLessThanOrEqual(49);
          // Open, it stands in the aisle cell, local x 0, beside the fridge.
          const [ox = 0, , oz = 0] = turn(corner, door.pivot, [0, 90, 0]);
          expect(ox, name).toBeGreaterThanOrEqual(-9 - 1e-6);
          expect(ox, name).toBeLessThanOrEqual(8);
          expect(oz, name).toBeGreaterThanOrEqual(-24);
          expect(oz, name).toBeLessThanOrEqual(-8);
        }
      heights.push(Math.max(...ys) - Math.min(...ys));
    }
    const [bottom = 0, top = 0] = heights;
    expect(top).toBeLessThan(bottom);
  });
  it("sweeps both fridge doors through the aisle beside the fridge without hitting the cab seat or standing decor", () => {
    const items = standingItems();
    const slots = CAMPER_FURNITURE.flatMap((f) => f.slots).filter(
      (s) => !s.hanging,
    );
    const obstacles = [
      ...(bone("seat_0").cubes ?? []).map((cube) => ({
        name: "cab seat_0",
        points: corners(cube).map((p) =>
          cube.rotation && cube.pivot ? turn(p, cube.pivot, cube.rotation) : p,
        ),
      })),
      ...slots.flatMap((slot) =>
        items.map((item) => {
          const { x, z } = slotXZ(slot);
          return {
            name: `${slot.id} ${item.id}`,
            points: corners({
              origin: [
                x - item.halfX,
                16 * slot.cell.layer + slot.height,
                z - item.halfZ,
              ],
              size: [2 * item.halfX, item.height, 2 * item.halfZ],
            }),
          };
        }),
      ),
    ];
    const nearby = obstacles.filter(
      ({ points }) =>
        Math.max(...points.map((p) => p[0] ?? 0)) > -10.1 &&
        Math.min(...points.map((p) => p[0] ?? 0)) < 8 &&
        Math.max(...points.map((p) => p[2] ?? 0)) > -24 &&
        Math.min(...points.map((p) => p[2] ?? 0)) < -8,
    );
    for (const name of ["fridge_bottom_door", "fridge_top_door"]) {
      const door = bone(name);
      for (let angle = 0; angle <= 90; angle += 2) {
        for (const cube of door.cubes ?? []) {
          const points = corners(cube).map((p) =>
            turn(p, door.pivot, [0, angle, 0]),
          );
          const outside = points.filter(
            ([x = 0, , z = 0]) =>
              x < -10.1 - 0.001 ||
              x > 8 + 0.001 ||
              z < -24 - 0.001 ||
              z > -8 + 0.001,
          );
          expect(outside, `${name} at ${angle}: ${cube.origin}`).toEqual([]);
          const hits = nearby.filter((other) => overlaps(points, other.points));
          expect(
            hits.map((other) => other.name),
            `${name} at ${angle}: ${cube.origin}`,
          ).toEqual([]);
        }
      }
    }
  });

  it("rounds the photo-shaped door tops and puts horizontal chrome levers by the free edge toward the entry", () => {
    for (const name of ["fridge_bottom_door", "fridge_top_door"]) {
      const cubes = bone(name).cubes ?? [];
      const levers = cubes.filter(
        (c) =>
          c.uv.north?.uv.every(
            (v, i) => v === (swatchUv("chrome")[i] ?? 0) + 0.5,
          ) && (c.size[2] ?? 0) > 3,
      );
      expect(levers.length, name).toBeGreaterThan(0);
      for (const lever of levers) {
        expect(lever.size[2]).toBeGreaterThan(lever.size[1] ?? 0);
        expect(lever.origin[2]).toBeGreaterThan(-16);
        expect(end(lever, 0)).toBeGreaterThan(-8.3);
      }
      const top = Math.max(...cubes.map((c) => end(c, 1)));
      const width =
        Math.max(...cubes.map((c) => end(c, 2))) -
        Math.min(...cubes.map((c) => c.origin[2] ?? 0));
      for (const cube of cubes.filter((c) => end(c, 1) > top - 0.01)) {
        expect(cube.size[2]).toBeLessThan(width - 0.1);
      }
    }
  });
});
