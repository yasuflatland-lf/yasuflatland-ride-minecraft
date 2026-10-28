import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { forward, localPoint } from "../../../../../src/domain/shared/vec";
import { rectCells } from "../../../../../src/domain/vehicle/cutArea";
import { SportsboatDrive } from "../../../../../src/domain/vehicle/kinds/sportsboat/drive";
import {
  bowBlocked,
  icebreakerColumns,
  recutDue,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/icebreaker";
import { SPORTSBOAT_SPEC as spec } from "../../../../../src/domain/vehicle/kinds/sportsboat/spec";
import { type Bone, turnedCorners } from "../../../../support/geometry";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const pose = fc.record({
  x: number(-1000, 1000),
  y: number(-60, 300),
  z: number(-1000, 1000),
});
const yaw = number(-180, 180);
const rule = spec.icebreaker;
const strip = {
  near: rule.probeNear,
  far: spec.ramFront + rule.probeAhead,
  halfWidth: spec.ramHalfWidth,
};

it("bounds the shipped stern including rotated and inflated geometry, rounded up to a hundredth", () => {
  const geometry = JSON.parse(
    readFileSync(
      "packs/yasu_ride_rp/models/entity/yasu_ride/sportsboat.geo.json",
      "utf8",
    ),
  )["minecraft:geometry"][0];
  const bones: Bone[] = geometry.bones;
  const stern = Math.max(
    ...bones.flatMap((b) =>
      (b.cubes ?? []).flatMap((c) => turnedCorners(b, c).map((p) => p[2] / 16)),
    ),
  );
  expect(rule.sternReach).toBeGreaterThanOrEqual(stern);
  expect(rule.sternReach - stern).toBeLessThan(0.01);
});

it("covers the hull rectangle with fixed vertical clearance and no extra stern margin", () => {
  fc.assert(
    fc.property(pose, yaw, (p, y) => {
      const columns = icebreakerColumns(p, y);
      const keys = new Set(columns.map((c) => `${c.x},${c.z}`));
      for (const c of rectCells(p, y, {
        near: -rule.sternReach,
        far: spec.ramFront,
        halfWidth: spec.ramHalfWidth,
      }))
        expect(keys.has(`${c.x},${c.z}`)).toBe(true);
      const f = forward(y);
      const radius = (Math.abs(f.x) + Math.abs(f.z)) / 2 + 1e-9;
      for (const c of columns) {
        expect(c.bottom).toBe(Math.floor(p.y) - rule.margin);
        expect(c.height).toBe(
          Math.ceil(p.y + spec.height + rule.margin) - c.bottom,
        );
        const ahead = (c.x + 0.5 - p.x) * f.x + (c.z + 0.5 - p.z) * f.z;
        expect(ahead).toBeGreaterThanOrEqual(-rule.sternReach - radius);
        expect(ahead).toBeLessThanOrEqual(spec.ramFront + rule.margin + radius);
      }
      for (const ahead of [-rule.sternReach, spec.ramFront + rule.margin])
        for (const side of [
          -spec.ramHalfWidth - rule.margin,
          spec.ramHalfWidth + rule.margin,
        ]) {
          const corner = localPoint(p, f, ahead, side);
          expect(
            keys.has(`${Math.floor(corner.x)},${Math.floor(corner.z)}`),
          ).toBe(true);
        }
    }),
  );
});

it("detects every strip cell at either height using offsets to cell centers", () => {
  fc.assert(
    fc.property(pose, yaw, fc.nat(), (p, y, index) => {
      const cells = rectCells(p, y, strip);
      const cell = cells[index % cells.length];
      if (!cell) throw new Error("empty probe strip");
      for (const height of rule.probeHeights) {
        expect(
          bowBlocked(
            p,
            y,
            (offset) =>
              offset.x === cell.x + 0.5 - p.x &&
              offset.z === cell.z + 0.5 - p.z &&
              offset.y === height,
          ),
        ).toBe(true);
      }
      expect(bowBlocked(p, y, () => false)).toBe(false);
      for (const [ahead, side] of [
        [-rule.sternReach, 0],
        [spec.ramFront, spec.ramHalfWidth + 2],
      ] as const) {
        const point = localPoint(p, forward(y), ahead, side);
        expect(
          bowBlocked(
            p,
            y,
            (offset) =>
              Math.floor(p.x + offset.x) === Math.floor(point.x) &&
              Math.floor(p.z + offset.z) === Math.floor(point.z),
          ),
        ).toBe(false);
      }
    }),
  );
});

it("rotates a blocked cell and the strip together by a quarter turn", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -10, max: 10 }),
      fc.nat(),
      (x, z, turn, index) => {
        const p = { x: x + 0.5, y: 0, z: z + 0.5 };
        const y = turn * 90;
        const cells = rectCells(p, y, strip);
        const cell = cells[index % cells.length];
        if (!cell) throw new Error("empty probe strip");
        expect(
          bowBlocked(
            { x: -p.z, y: p.y, z: p.x },
            y + 90,
            (offset) =>
              Math.floor(-p.z + offset.x) === -cell.z - 1 &&
              Math.floor(p.x + offset.z) === cell.x,
          ),
        ).toBe(true);
      },
    ),
  );
});

it("starts probing at the collision box even before the bow reaches the obstacle", () => {
  const p = { x: 0.5, y: 0, z: 0.5 };
  expect(bowBlocked(p, 0, (offset) => Math.floor(p.z + offset.z) === 2)).toBe(
    true,
  );
});

const allMet = {
  on: true,
  driver: true,
  afloat: true,
  blocked: true,
  throttle: 1,
};

it.each([
  { name: "all conditions met", ...allMet, cuts: true },
  { name: "mode off", ...allMet, on: false, cuts: false },
  { name: "no driver", ...allMet, driver: false, cuts: false },
  { name: "beached", ...allMet, afloat: false, cuts: false },
  { name: "neutral throttle", ...allMet, throttle: 0, cuts: false },
  { name: "reverse", ...allMet, throttle: -1, cuts: false },
  { name: "clear bow", ...allMet, blocked: false, cuts: false },
])(
  "gates the cut on water and lava: $name",
  ({ on, driver, afloat, blocked, throttle, cuts }) => {
    fc.assert(
      fc.property(pose, yaw, (location, heading) => {
        for (const lava of [false, true]) {
          const drive = new SportsboatDrive(heading, { icebreaker: on });
          let probes = 0;
          const step = drive.step(
            driver ? { moveX: 0, moveY: throttle, jump: false } : undefined,
            {
              tick: 0,
              location,
              velocity: { x: 0, y: 0, z: 0 },
              onGround: !afloat,
              deckSeatInputs: [],
              blockTypes: () => [],
              waterAt: () => afloat && !lava,
              lavaAt: () => afloat && lava,
              solidAt: () => {
                probes++;
                return blocked;
              },
            },
          );
          if (cuts)
            expect(step.cut).toEqual(icebreakerColumns(location, drive.yaw));
          else expect(step.cut).toBeUndefined();
          if (!(on && driver && afloat && throttle > 0)) expect(probes).toBe(0);
        }
      }),
    );
  },
);

it("does not cut while creeping sideways even with a positive raw forward component", () => {
  fc.assert(
    fc.property(
      pose,
      yaw,
      fc.constantFrom(-1, 1),
      (location, heading, moveX) => {
        const step = new SportsboatDrive(heading, { icebreaker: true }).step(
          { moveX, moveY: 0.01, jump: false },
          {
            tick: 0,
            location,
            velocity: { x: 0, y: 0, z: 0 },
            onGround: false,
            deckSeatInputs: [],
            blockTypes: () => [],
            waterAt: () => true,
            solidAt: () => true,
          },
        );
        expect(step.cut).toBeUndefined();
      },
    ),
  );
});

it("cuts a still blocked bow again only after the boat moves or the recut delay passes", () => {
  fc.assert(
    fc.property(
      pose,
      fc.nat(1000),
      fc.nat(rule.recutTicks - 1),
      number(0, rule.recutDistance * 0.99),
      number(-180, 180),
      (location, tick, waited, drift, heading) => {
        const last = { tick, location };
        const step = forward(heading);
        const at = (d: number) => ({
          ...location,
          x: location.x + step.x * d,
          z: location.z + step.z * d,
        });
        expect(recutDue(undefined, tick, location)).toBe(true);
        expect(recutDue(last, tick + waited, at(drift))).toBe(false);
        expect(recutDue(last, tick + rule.recutTicks, at(drift))).toBe(true);
        // 1% over the threshold, so rounding at |x| = 1000 cannot land below it.
        expect(
          recutDue(last, tick + waited, at(rule.recutDistance * 1.01)),
        ).toBe(true);
      },
    ),
  );
});

function blockedRun(
  ticks: number,
  { move = 0, clearOn = -1 }: { move?: number; clearOn?: number } = {},
): number[] {
  const drive = new SportsboatDrive(0, { icebreaker: true });
  const cuts: number[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    const step = drive.step(
      { moveX: 0, moveY: 1, jump: false },
      {
        tick,
        location: { x: 0.5, y: 64, z: 0.5 - tick * move },
        velocity: { x: 0, y: 0, z: 0 },
        onGround: false,
        deckSeatInputs: [],
        blockTypes: () => [],
        waterAt: () => true,
        solidAt: () => tick !== clearOn,
      },
    );
    if (step.cut) cuts.push(tick);
  }
  return cuts;
}

it("does not repeat the cut every tick while a kept block holds the bow", () => {
  expect(blockedRun(rule.recutTicks * 2 + 1)).toEqual([
    0,
    rule.recutTicks,
    rule.recutTicks * 2,
  ]);
});

it("cuts on the next blocked tick once the bow has been clear", () => {
  expect(blockedRun(3, { clearOn: 1 })).toEqual([0, 2]);
});

it("cuts every blocked tick while the boat keeps moving", () => {
  expect(blockedRun(5, { move: rule.recutDistance })).toEqual([0, 1, 2, 3, 4]);
});
