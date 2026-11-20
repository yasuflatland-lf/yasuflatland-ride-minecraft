import { expect, it } from "vitest";
import {
  HALF_X,
  HALF_Z,
  INSIDE_LAYERS,
} from "../../../src/domain/vehicle/kinds/camper/roomGeometry";
import {
  CAMPER_SPEC,
  PX_PER_BLOCK,
} from "../../../src/domain/vehicle/kinds/camper/spec";
import { turnedCorners } from "../../support/geometry";
import { areaCubes, areaRanges, bones, type Cube, end } from "./helpers";

const width = CAMPER_SPEC.bodyHalfWidth * PX_PER_BLOCK;
const front = -CAMPER_SPEC.bodyFront * PX_PER_BLOCK;
const rear = CAMPER_SPEC.bodyRear * PX_PER_BLOCK;
const roof = CAMPER_SPEC.carHeight * PX_PER_BLOCK;
const roomX = (HALF_X + 0.5) * PX_PER_BLOCK;
const roomZ = (HALF_Z + 0.5) * PX_PER_BLOCK;
const floorY = INSIDE_LAYERS[0] * PX_PER_BLOCK;
type Zone = {
  width: number;
  bottom: number;
  top: number;
  front: number;
  rear: number;
};
const exterior = { width, bottom: 0, top: roof, front, rear };
const interior = {
  width: roomX,
  bottom: floorY,
  top: roof,
  front: -roomZ,
  rear: roomZ,
};

// Budgets allow ten percent growth, rounded up. Distances are model pixels.
const areas = {
  shell: { max: 828, zone: { ...exterior, width: width + 1 } }, // Side trim and fasteners.
  floor: { max: 2, zone: { ...interior, bottom: floorY - 3 }, symmetric: true }, // Floor slab below foot level.
  walls: { max: 107, zone: interior },
  tile: { max: 5, zone: interior },
  table: { max: 3, zone: interior },
  curtains: { max: 446, zone: interior },
  door: { max: 361, zone: { ...exterior, width: width + 6 } }, // Fold-out entry step.
  front: {
    max: 1565,
    zone: {
      ...exterior,
      width: width + 6.3,
      front: front - 3.1,
      top: roof + 1,
    },
  }, // Side mirrors, folded nose and clearance lights.
  rear: {
    max: 863,
    zone: { ...exterior, width: width + 0.5, rear: rear + 0.1, top: roof + 4 },
  }, // Bumper ends and ladder rails.
  roof: { max: 51, zone: { ...exterior, width: width + 0.4, top: roof + 4 } }, // Edge trim and roof fixtures.
  running: { max: 283, zone: exterior, symmetric: true },
  cab: { max: 1022, zone: exterior }, // The dash follows the windshield beyond the room cells.
  bed_bunk: { max: 7, zone: interior },
  steering: { max: 162, zone: interior },
  cab_seats: { max: 1103, zone: interior },
  room: { max: 13, zone: interior },
  fridge: { max: 3513, zone: interior },
  shower: { max: 1062, zone: interior },
  counter: { max: 22, zone: interior },
  range: { max: 40, zone: interior },
  burner: { max: 230, zone: interior },
  kitchen_fronts: { max: 33, zone: interior },
  soft: { max: 82, zone: interior },
  ceiling: { max: 8, zone: interior },
  arches: { max: 42, zone: exterior },
} satisfies Record<string, { max: number; zone: Zone; symmetric?: boolean }>;

const finiteVector = (v?: number[]) =>
  v?.length === 3 && v.every(Number.isFinite);
function wellFormed(c: Cube) {
  return (
    finiteVector(c.origin) &&
    finiteVector(c.size) &&
    c.size.every((s, axis) => s >= 0 && Number.isFinite(end(c, axis))) &&
    c.size.filter((s) => s > 0).length >= 2 &&
    (c.rotation === undefined ||
      (finiteVector(c.rotation) && finiteVector(c.pivot)))
  );
}

const shape = (c: Cube) =>
  JSON.stringify([c.origin, c.size, c.rotation ?? [0, 0, 0]]);
type Entry = ReturnType<typeof areaCubes>[number];
const corners = ({ owner, cube }: Entry) => turnedCorners(owner, cube);
function inside(entry: Entry, z: Zone) {
  // Only absorb floating-point error at a face exactly on the boundary.
  const eps = 1e-9;
  return corners(entry).every(
    ([x, y, depth]) =>
      Math.abs(x) <= z.width + eps &&
      y >= z.bottom - eps &&
      y <= z.top + eps &&
      depth >= z.front - eps &&
      depth <= z.rear + eps,
  );
}

function shapes(entries: Entry[], reflect: boolean) {
  return entries
    .map((entry) =>
      corners(entry)
        .map(([x, y, z]) =>
          [reflect ? -x : x, y, z].map((n) => Math.round(n * 1e8)).join(","),
        )
        .sort()
        .join("|"),
    )
    .sort();
}

it("budgets every generated area and the total non-glow model", () => {
  expect(Object.keys(areas).sort()).toEqual(Object.keys(areaRanges).sort());
  const total = bones
    .filter((b) => !b.name.startsWith("glow_"))
    .reduce((n, b) => n + (b.cubes?.length ?? 0), 0);
  expect(total).toBeLessThanOrEqual(
    Object.values(areas).reduce((n, a) => n + a.max, 0),
  );
});

it.each(Object.entries(areas))(
  "checks %s cube shapes, budget and rotated zone",
  (area, rule) => {
    const entries = areaCubes(area);
    expect(entries.length).toBeLessThanOrEqual(rule.max);
    for (const entry of entries) {
      const label = `${area} ${entry.owner.name}[${entry.index}] at ${entry.cube.origin}`;
      expect(wellFormed(entry.cube), label).toBe(true);
      expect(inside(entry, rule.zone), label).toBe(true);
    }
    if ("symmetric" in rule)
      expect(shapes(entries, true)).toEqual(shapes(entries, false));
  },
);

it("has no duplicate cubes within a non-glow bone", () => {
  for (const b of bones.filter((b) => !b.name.startsWith("glow_"))) {
    const seen = new Set<string>();
    for (const [i, c] of (b.cubes ?? []).entries()) {
      const key = shape(c);
      expect(seen.has(key), `${b.name}[${i}] ${key}`).toBe(false);
      seen.add(key);
    }
  }
});
