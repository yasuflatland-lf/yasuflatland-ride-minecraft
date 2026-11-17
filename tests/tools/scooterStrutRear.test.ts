import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { Triple } from "../support/geometry";
import { boneCubes, cubeBounds, loadScooterGeo } from "./helpers/scooterGeo";

type Box = [Triple, Triple];
type StrutFacts = {
  collar: { origin: Triple; size: Triple }[];
  rodCount: number;
  axleY: number;
  axleZ: number;
  drop: number;
  tyreRadius: number;
  tyreHalfWidth: number;
  wheelScale: number;
  budget: number;
};

const facts: StrutFacts = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
d=load_tool('scooter_dims')
k=load_tool('scooter_kit')
s=load_tool('scooter_struts')
result=k.AreaCubes()
s._rear(result)
keys=load_tool('scooter_anim').build()['animations']['animation.yasu_ride.scooter.wheels_deploy']['bones'][d.STRUT_BONES['rear']]['position']
print(json.dumps(dict(
    collar=[dict(origin=c['origin'], size=c['size']) for c in result.get('body', [])],
    rodCount=len(result.get(d.STRUT_BONES['rear'], [])),
    axleY=d.AXLE_Y, axleZ=d.REAR_AXLE_Z, drop=-min(v[1] for v in keys.values()),
    tyreRadius=d.TYRE_RADIUS, tyreHalfWidth=d.TYRE_HALF_WIDTH,
    wheelScale=load_tool('scooter_running').REAR_WHEEL_SCALE, budget=d.CUBE_BUDGET)))
`,
    ],
    { encoding: "utf8" },
  ),
);

const EPS = 1e-6;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-4;
const sameCube = (
  cube: { origin: Triple; size: Triple },
  ref: { origin: Triple; size: Triple },
) =>
  [0, 1, 2].every(
    (axis) =>
      close(cube.origin[axis] ?? 0, ref.origin[axis] ?? 0) &&
      close(cube.size[axis] ?? 0, ref.size[axis] ?? 0),
  );
const overlaps = (a: Box, b: Box) =>
  [0, 1, 2].every(
    (axis) =>
      (a[0][axis] ?? 0) < (b[1][axis] ?? 0) - EPS &&
      (b[0][axis] ?? 0) < (a[1][axis] ?? 0) - EPS,
  );
const lowered = ([lo, hi]: Box, dy: number): Box => [
  [lo[0], lo[1] - dy, lo[2]],
  [hi[0], hi[1] - dy, hi[2]],
];

const body = boneCubes("body");
const collar = body.filter((cube) =>
  facts.collar.some((ref) => sameCube(cube, ref)),
);
const fixedBody = body.filter((cube) => !collar.includes(cube));
const rod = boneCubes("wheel_rear_strut");
const collarBoxes = collar.map(cubeBounds);
const rodBoxes = rod.map(cubeBounds);
const tyreTop = facts.axleY + facts.tyreRadius * facts.wheelScale;

describe("scooter rear telescoping strut", () => {
  it("adds at most two collar cubes on body and two rod cubes on the strut bone", () => {
    expect(facts.collar.length).toBeGreaterThan(0);
    expect(facts.collar.length).toBeLessThanOrEqual(2);
    expect(collar).toHaveLength(facts.collar.length);
    expect(rod.length).toBeGreaterThan(0);
    expect(rod.length).toBeLessThanOrEqual(2);
    expect(rod).toHaveLength(facts.rodCount);
  });

  it("keeps every strut cube axis-aligned on the rear axle centre line", () => {
    for (const cube of [...collar, ...rod]) {
      expect((cube.rotation ?? [0, 0, 0]).every((v) => v === 0)).toBe(true);
      const [lo, hi] = cubeBounds(cube);
      expect(close((lo[0] + hi[0]) / 2, 0)).toBe(true);
      expect(close((lo[2] + hi[2]) / 2, facts.axleZ)).toBe(true);
    }
  });

  it("starts the rod at the axle and keeps the collar wider than it", () => {
    const rodBottom = Math.min(...rodBoxes.map(([lo]) => lo[1]));
    expect(close(rodBottom, facts.axleY)).toBe(true);
    const rodWidth = Math.max(...rodBoxes.map(([lo, hi]) => hi[0] - lo[0]));
    for (const [lo, hi] of collarBoxes) {
      expect(hi[0] - lo[0]).toBeGreaterThan(rodWidth);
      expect(hi[2] - lo[2]).toBeGreaterThan(rodWidth);
      expect(lo[1]).toBeGreaterThanOrEqual(facts.axleY);
    }
  });

  it("keeps the rod inside the collar at rest and at the dropped pose", () => {
    for (const dy of [0, facts.drop]) {
      expect(
        rodBoxes.some((rodBox) =>
          collarBoxes.some((collarBox) =>
            overlaps(lowered(rodBox, dy), collarBox),
          ),
        ),
      ).toBe(true);
    }
  });

  it("anchors the collar top in a fixed body cube", () => {
    const top = collarBoxes.reduce((a, b) => (b[1][1] > a[1][1] ? b : a));
    const anchors = fixedBody.filter((cube) => {
      const [lo, hi] = cubeBounds(cube);
      return overlaps(top, [lo, hi]) && lo[1] < top[1][1] && hi[1] > top[1][1];
    });
    expect(anchors.length).toBeGreaterThan(0);
  });

  it("hides the strut at rest inside the rear tyre or under the cowl", () => {
    const anchor = fixedBody
      .map(cubeBounds)
      .filter((box) =>
        collarBoxes.some((collarBox) => overlaps(collarBox, box)),
      );
    for (const [lo, hi] of [...rodBoxes, ...collarBoxes]) {
      // Below the tyre top the cube must sit inside the tyre width.
      if (lo[1] < tyreTop) {
        const half = Math.max(Math.abs(lo[0]), Math.abs(hi[0]));
        const inTyre = half <= facts.tyreHalfWidth * facts.wheelScale;
        expect(inTyre).toBe(true);
      }
      // Above it, the cube must stay under the cowl underside it is anchored to.
      if (hi[1] > tyreTop) {
        expect(
          anchor.some(
            ([alo, ahi]) =>
              alo[0] <= lo[0] &&
              hi[0] <= ahi[0] &&
              alo[2] <= lo[2] &&
              hi[2] <= ahi[2] &&
              hi[1] < ahi[1],
          ),
        ).toBe(true);
      }
    }
    for (const [, hi] of rodBoxes) expect(hi[1]).toBeLessThan(tyreTop + 0.3);
  });

  it("stays within the cube budget", () => {
    const total = loadScooterGeo().bones.reduce(
      (sum, bone) => sum + (bone.cubes?.length ?? 0),
      0,
    );
    expect(total).toBeLessThanOrEqual(facts.budget);
  });
});
