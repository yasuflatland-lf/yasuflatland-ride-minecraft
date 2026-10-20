import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { forward, leftOf, type Vec3 } from "../../../src/domain/shared/vec";
import {
  type HeldItem,
  HINT_TIMING,
  HINTS,
  type Hint,
  type HintControls,
  type HintName,
  type HintState,
  type HintView,
  type HintZones,
  hintAt,
  NO_HINT,
  stepHint,
  zoneOf,
} from "../../../src/domain/vehicle/hints";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { defined } from "../../support/defined";

const ZONES = defined(CAMPER_PROFILE.hints, "camper hints");
const BUMPER = defined(ZONES.bumper, "camper bumper zone");
const SEAT_ZONE = defined(ZONES.driverSeat, "camper seat zone");
const SEATS = CAMPER_PROFILE.seats.positions;
const SEAT0 = defined(SEATS[0], "seat 0");

// Grid values offset from round numbers, so no sample lands exactly on a zone edge
// where rotation rounding could flip the answer.
const coord = (lo: number, hi: number) =>
  fc
    .integer({ min: Math.round(lo * 1000), max: Math.round(hi * 1000) - 1 })
    .map((n) => n / 1000 + 0.0003);
const controlsArb = fc.constantFrom<HintControls>("touch", "mouse", "other");
const heldArb = fc.constantFrom<HeldItem>("dye", "other");
const yawArb = fc.double({ min: -180, max: 180, noNaN: true });

/** The world offset of a point `x` left and `z` ahead of a vehicle facing `yaw`. */
function worldOffset(yaw: number, x: number, y: number, z: number): Vec3 {
  const f = forward(yaw);
  const l = leftOf(f);
  return { x: l.x * x + f.x * z, y, z: l.z * x + f.z * z };
}

const viewArb = fc.record({
  x: coord(-6, 6),
  y: coord(-2, 5),
  z: coord(-6, 8),
  yaw: yawArb,
  docked: fc.boolean(),
  driverSeatFree: fc.boolean(),
  hasRiders: fc.boolean(),
  held: heldArb,
  controls: controlsArb,
});
type ViewSample = typeof viewArb extends fc.Arbitrary<infer T> ? T : never;

const viewOf = (s: ViewSample, yaw = s.yaw): HintView => ({
  kind: "camper",
  offset: worldOffset(yaw, s.x, s.y, s.z),
  yaw,
  docked: s.docked,
  driverSeatFree: s.driverSeatFree,
  hasRiders: s.hasRiders,
  held: s.held,
  controls: s.controls,
});

const isBumperHint = (h: Hint | undefined) =>
  h?.name === HINTS.bumperTouch ||
  h?.name === HINTS.bumperMouse ||
  h?.name === HINTS.bumperOther ||
  h?.name === HINTS.paint;
const isDriveHint = (h: Hint | undefined) =>
  h?.name === HINTS.driveTouch ||
  h?.name === HINTS.driveMouse ||
  h?.name === HINTS.driveOther;

describe("hintAt", () => {
  it("gives the same hint whichever way the vehicle faces", () => {
    fc.assert(
      fc.property(viewArb, (s) => {
        expect(hintAt(ZONES, SEATS, viewOf(s))).toEqual(
          hintAt(ZONES, SEATS, viewOf(s, 0)),
        );
      }),
    );
  });

  it("gives nothing for a kind without hints or for the zones it leaves out", () => {
    fc.assert(
      fc.property(viewArb, (s) => {
        expect(hintAt(undefined, SEATS, viewOf(s))).toBeUndefined();
        expect(hintAt({}, SEATS, viewOf(s))).toBeUndefined();
        expect(isDriveHint(hintAt({ bumper: BUMPER }, SEATS, viewOf(s)))).toBe(
          false,
        );
        expect(
          isBumperHint(hintAt({ driverSeat: SEAT_ZONE }, SEATS, viewOf(s))),
        ).toBe(false);
      }),
    );
  });

  it("never gives a bumper hint to a player inside the body, as far in as the margin", () => {
    fc.assert(
      fc.property(
        viewArb,
        fc.double({ min: 0, max: SPEC.hintExitMargin, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (s, margin, u, v) => {
          const half = CAMPER_SPEC.bodyHalfWidth - margin - 0.01;
          const x = (2 * u - 1) * half;
          const z =
            -CAMPER_SPEC.bodyRear +
            v * (CAMPER_SPEC.bodyFront - margin - 0.01 + CAMPER_SPEC.bodyRear);
          expect(
            isBumperHint(hintAt(ZONES, SEATS, viewOf({ ...s, x, z }), margin)),
          ).toBe(false);
        },
      ),
    );
  });

  it("gives nothing to feet outside every zone's height band", () => {
    const low = Math.min(BUMPER.feet[0], SEAT_ZONE.feet[0]);
    const high = Math.max(BUMPER.feet[1], SEAT_ZONE.feet[1]);
    fc.assert(
      fc.property(
        viewArb,
        fc.oneof(coord(low - 5, low - 0.01), coord(high + 0.01, high + 5)),
        (s, y) => {
          expect(hintAt(ZONES, SEATS, viewOf({ ...s, y }))).toBeUndefined();
        },
      ),
    );
  });

  it("asks a player with a dye to paint, and anyone else to hit the bumper the hits it takes unless a rider keeps it whole", () => {
    fc.assert(
      fc.property(
        viewArb,
        coord(-2, 2),
        coord(BUMPER.boxZ + 0.6, BUMPER.boxZ + 1.5),
        coord(BUMPER.feet[0], BUMPER.feet[1]),
        (s, x, z, y) => {
          // In front of the bumper, so never at the seat.
          const hint = hintAt(ZONES, SEATS, viewOf({ ...s, x, y, z }));
          const vehicle = { vehicle: "camper" };
          if (s.held === "dye")
            expect(hint).toEqual({ name: HINTS.paint, with: [vehicle] });
          else if (s.hasRiders) expect(hint).toBeUndefined();
          else
            expect(hint).toEqual({
              name: `bumper_${s.controls}`,
              with: [{ number: SPEC.hitsToBreak }, vehicle],
            });
        },
      ),
    );
  });

  it("gives the drive hint only at a free driver's seat of a parked vehicle", () => {
    fc.assert(
      fc.property(viewArb, (s) => {
        const hint = hintAt(ZONES, SEATS, viewOf(s));
        if (isDriveHint(hint)) {
          expect(s.docked && s.driverSeatFree).toBe(true);
          expect(hint).toEqual({ name: `drive_${s.controls}` });
        }
      }),
    );
  });

  it("gives no drive hint to a player nearer another seat, which a long-press would take", () => {
    fc.assert(
      fc.property(viewArb, (s) => {
        const local = { x: s.x, z: s.z };
        const to = (p: { x: number; z: number }) =>
          Math.hypot(local.x - p.x, local.z - p.z);
        if (SEATS.some((seat) => to(seat) < to(SEAT0)))
          expect(isDriveHint(hintAt(ZONES, SEATS, viewOf(s)))).toBe(false);
      }),
    );
    const between = defined(SEATS[1], "seat 1");
    const view = viewOf({
      x: (SEAT0.x + 3 * between.x) / 4,
      y: 1,
      z: SEAT0.z,
      yaw: 0,
      docked: true,
      driverSeatFree: true,
      hasRiders: false,
      held: "other",
      controls: "touch",
    });
    expect(isDriveHint(hintAt(ZONES, SEATS, view))).toBe(false);
  });

  it("gives the drive hint before the bumper hint where both apply", () => {
    const both: HintZones = {
      bumper: { ...BUMPER, bodyHalfWidth: 0, reach: 100 },
      driverSeat: { reach: 100, feet: BUMPER.feet },
    };
    fc.assert(
      fc.property(viewArb, coord(BUMPER.feet[0], BUMPER.feet[1]), (s, y) => {
        const view = viewOf({ ...s, y, docked: true, driverSeatFree: true });
        expect(hintAt(both, [SEAT0], view)).toEqual({
          name: `drive_${s.controls}`,
        });
      }),
    );
  });

  it("keeps every hint within its own zone when the reach widens", () => {
    fc.assert(
      fc.property(
        viewArb,
        fc.double({ min: 0, max: 2, noNaN: true }),
        (s, margin) => {
          const hint = hintAt(ZONES, SEATS, viewOf(s));
          if (hint)
            expect(
              hintAt(zoneOf(ZONES, hint.name), SEATS, viewOf(s), margin),
            ).toEqual(hint);
        },
      ),
    );
  });

  it("keeps the paint hint where a widened driver's seat zone overlaps it (issue #355)", () => {
    const view = viewOf({
      x: 0.0003,
      y: 0.5003,
      z: 3.7003,
      yaw: 0,
      docked: true,
      driverSeatFree: true,
      hasRiders: false,
      held: "dye",
      controls: "touch",
    });
    const paint = { name: HINTS.paint, with: [{ vehicle: "camper" }] };
    expect(hintAt(ZONES, SEATS, view)).toEqual(paint);
    // The whole prioritized result switches to the seat, so the retry uses one zone.
    expect(hintAt(ZONES, SEATS, view, 0.2675)).toEqual({
      name: HINTS.driveTouch,
    });
    expect(hintAt(zoneOf(ZONES, HINTS.paint), SEATS, view, 0.2675)).toEqual(
      paint,
    );
  });

  it("holds each hint by the zone that gives it", () => {
    for (const name of Object.values(HINTS))
      expect(zoneOf(ZONES, name)).toEqual(
        name.startsWith("drive_")
          ? { driverSeat: SEAT_ZONE }
          : { bumper: BUMPER },
      );
  });

  it("shows the seat hint to a player standing beside the driver's seat in the room", () => {
    const view = viewOf({
      x: SEAT0.x,
      y: 1,
      z: SEAT0.z - 1,
      yaw: 90,
      docked: true,
      driverSeatFree: true,
      hasRiders: false,
      held: "other",
      controls: "touch",
    });
    expect(hintAt(ZONES, SEATS, view)).toEqual({ name: HINTS.driveTouch });
    expect(hintAt(ZONES, SEATS, { ...view, docked: false })).toBeUndefined();
  });
});

describe("stepHint", () => {
  const TICK = SPEC.hintCheckInterval;
  const names = Object.values(HINTS);
  const candidates = fc.array(
    fc.option(fc.constantFrom<HintName>(...names), { nil: undefined }),
    { maxLength: 200 },
  );

  /** Runs the checks one interval apart, from tick 0. */
  function run(seq: readonly (HintName | undefined)[]) {
    let state: HintState = NO_HINT;
    return seq.map((name, i) => {
      const tick = i * TICK;
      const before = state;
      const next = stepHint(before, name && { name }, tick);
      state = next.state;
      return { tick, name, before, action: next.action };
    });
  }

  it("shows a changed hint at once and clears once on leaving", () => {
    fc.assert(
      fc.property(candidates, (seq) => {
        for (const { name, before, action } of run(seq)) {
          if (name !== undefined && name !== before.shown)
            expect(action).toEqual({ show: { name } });
          if (name === undefined)
            expect(action).toBe(
              before.shown === undefined ? undefined : "clear",
            );
        }
      }),
    );
  });

  it("repeats a hint no sooner than the refresh and stops after the show time", () => {
    fc.assert(
      fc.property(candidates, (seq) => {
        let since = 0;
        let last = 0;
        for (const { tick, name, before, action } of run(seq)) {
          if (!action || action === "clear") continue;
          if (before.shown !== name) {
            since = tick;
          } else {
            expect(tick - last).toBeGreaterThanOrEqual(HINT_TIMING.refresh);
            expect(tick - since).toBeLessThan(HINT_TIMING.showFor);
          }
          last = tick;
        }
      }),
    );
  });

  it("re-sends while the player stays, until the show time ends", () => {
    const steps = run(new Array(60).fill(HINTS.paint));
    const shown = steps
      .filter((s) => s.action !== undefined)
      .map((s) => s.tick);
    const expected: number[] = [];
    for (let t = 0; t < HINT_TIMING.showFor; t += HINT_TIMING.refresh)
      expected.push(t);
    expect(shown).toEqual(expected);
  });

  it("does nothing while nothing is shown and no hint applies", () => {
    expect(stepHint(NO_HINT, undefined, 0)).toEqual({ state: NO_HINT });
  });
});
