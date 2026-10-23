import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { forward, leftOf, type Vec3 } from "../../../src/domain/shared/vec";
import type { Drive } from "../../../src/domain/vehicle/drive";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import { CAMPER_PROFILE } from "../../../src/domain/vehicle/kinds/camper/profile";
import {
  AIR,
  localCellAt,
  parkPose,
} from "../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { DOCK } from "../../../src/domain/vehicle/motion/dock";
import type { VehicleProfile } from "../../../src/domain/vehicle/profile";
import { type StandInPose, yawGap } from "../../../src/domain/vehicle/standIn";
import {
  Vehicle,
  type VehicleTickInput,
} from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";

const RULE = defined(CAMPER_PROFILE.standIn, "camper stand-in");

/** The camper with its stand-in rule's lift limits replaced by `lifts`. */
function camperWithLifts(lifts: {
  maxLift?: number;
  parkedMaxLift?: number;
}): VehicleProfile {
  const { maxLift: _max, parkedMaxLift: _parked, ...rule } = RULE;
  return { ...CAMPER_PROFILE, standIn: { ...rule, ...lifts } };
}
const yaw = fc.double({ min: -720, max: 720, noNaN: true });
const cell = fc.integer({ min: -50, max: 50 });

function input(
  tick: number,
  location: Vec3,
  solidAt: (offset: Vec3) => boolean = () => false,
): VehicleTickInput {
  return {
    tick,
    riders: [],
    deckSeatInputs: [],
    location,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt,
    waterAt: () => false,
    blockTypes: (cells) => cells.map(() => AIR),
    targets: () => [],
  };
}

/** The world centers of the stand-in's boxes: bumperBoxXs along its row axis. */
function boxCenters(pose: StandInPose): Vec3[] {
  return CAMPER_SPEC.bumperBoxXs.map((x) => ({
    x: pose.x + (pose.axis === "x" ? x : 0),
    y: pose.y + CAMPER_SPEC.bumperBoxY,
    z: pose.z + (pose.axis === "z" ? x : 0),
  }));
}

/** A camper whose stub drive faces `yaws[tick]` and is held at `hold` when given. */
function stubCamper(
  yaws: readonly number[],
  hold?: Vec3,
  profile: VehicleProfile = CAMPER_PROFILE,
) {
  let tick = 0;
  const drive: Drive = {
    speed: 0,
    get yaw() {
      return yaws[Math.min(tick, yaws.length - 1)] ?? 0;
    },
    resync() {},
    onDriverMounted() {},
    onSeatVacated: () => [],
    step: () => ({
      impulse: { x: 0, y: 0, z: 0 },
      forward: forward(0),
      commands: [],
      riders: { thirdPerson: false, underwater: false },
      ...(hold && {
        dock: { hold: { ...hold, yaw: drive.yaw }, cells: [], seats: [] },
      }),
    }),
  };
  const vehicle = new Vehicle(asVehicleId("v"), profile, drive);
  return {
    vehicle,
    next(location: Vec3, solidAt?: (offset: Vec3) => boolean) {
      const out = vehicle.tick(input(tick, location, solidAt));
      tick++;
      return out;
    },
  };
}

describe("vehicle stand-in (ADR 0116)", () => {
  it.each<VehicleKind>(["suv", "sportsboat"])(
    "is absent for the %s, which takes hits on its own boxes",
    (kind) => {
      const vehicle = createVehicle(kind, asVehicleId("v"), 0);
      expect(
        vehicle.tick(input(0, { x: 0, y: 64, z: 0 })).standIn,
      ).toBeUndefined();
    },
  );

  it("stands on the true bumper center while driving, its row never more than 45 degrees plus the margin off the bumper", () => {
    fc.assert(
      fc.property(
        fc.array(yaw, { minLength: 1, maxLength: 20 }),
        fc.record({ x: cell, y: cell, z: cell }),
        (yaws, at) => {
          const camper = stubCamper(yaws);
          for (const y of yaws) {
            const pose = defined(camper.next(at).standIn, "stand-in");
            const f = forward(y);
            expect(pose.name).toBe(RULE.name);
            expect(pose.x).toBeCloseTo(at.x + f.x * CAMPER_SPEC.bodyFront, 6);
            expect(pose.y).toBe(at.y);
            expect(pose.z).toBeCloseTo(at.z + f.z * CAMPER_SPEC.bodyFront, 6);
            const across = leftOf(f);
            const along = Math.abs(pose.axis === "x" ? across.x : across.z);
            const skew = (Math.acos(Math.min(1, along)) * 180) / Math.PI;
            expect(skew).toBeLessThanOrEqual(45 + RULE.turnMargin + 1e-6);
          }
        },
      ),
    );
  });

  it("keeps its row axis while the yaw swings within the margin around the 45-degree line", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -4, max: 4 }),
        fc.array(
          fc.double({
            min: -RULE.turnMargin,
            max: RULE.turnMargin,
            noNaN: true,
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (quarter, swings) => {
          const facing = quarter * 90;
          const yaws = [facing, ...swings.map((s) => facing + 45 + s)];
          const camper = stubCamper(yaws);
          const axes = yaws.map(
            () => defined(camper.next({ x: 0, y: 0, z: 0 }).standIn, "s").axis,
          );
          expect(new Set(axes).size).toBe(1);
        },
      ),
    );
  });

  it("puts a held camper's boxes on its hold pose, in the parked room's row in front of the floor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        cell,
        cell,
        cell,
        yaw,
        (quarter, cx, cy, cz, before) => {
          const snapped = quarter * 90;
          const hold = { x: cx + 0.5, y: cy, z: cz + 0.5 };
          // The camper turned from any yaw before it parked.
          const camper = stubCamper([before, snapped], hold);
          camper.next({ x: 0, y: 0, z: 0 });
          const pose = defined(
            camper.next({ x: 99, y: 99, z: 99 }).standIn,
            "stand-in",
          );
          const parked = { ...hold, yaw: snapped };
          // The floor ends at local z 3; the bumper is local row 4 (ADR 0068, 0084).
          const row = CAMPER_SPEC.bumperBoxXs.map((x) =>
            localCellAt(parked, { x, z: 4, layer: 0 }),
          );
          const cells = boxCenters(pose).map((c) => ({
            x: Math.floor(c.x),
            y: Math.floor(c.y),
            z: Math.floor(c.z),
          }));
          expect(new Set(cells.map((c) => JSON.stringify(c)))).toEqual(
            new Set(row.map((c) => JSON.stringify(c))),
          );
        },
      ),
    );
  });

  it("covers the whole bumper, 1 block high, reaching half a block into the body, at every parked yaw", () => {
    fc.assert(
      fc.property(fc.integer({ min: -8, max: 8 }), (quarter) => {
        const snapped = quarter * 90;
        const hold = { x: 0.5, y: 64, z: 0.5 };
        const pose = defined(
          stubCamper([snapped], hold).next(hold).standIn,
          "stand-in",
        );
        const f = forward(snapped);
        const l = leftOf(f);
        const half = CAMPER_SPEC.bumperBoxSize / 2;
        const local = boxCenters(pose).map((c) => ({
          left: (c.x - hold.x) * l.x + (c.z - hold.z) * l.z,
          ahead: (c.x - hold.x) * f.x + (c.z - hold.z) * f.z,
          up: c.y - hold.y,
        }));
        for (const box of local) {
          expect(box.ahead - half).toBeCloseTo(CAMPER_SPEC.bodyFront - half, 9);
          expect(box.up - half).toBeCloseTo(0, 9);
        }
        const lefts = local.map((b) => b.left).sort((a, b) => a - b);
        expect(lefts[0] ?? 0).toBeCloseTo(-CAMPER_SPEC.bodyHalfWidth + half, 9);
        expect(lefts.at(-1) ?? 0).toBeCloseTo(
          CAMPER_SPEC.bodyHalfWidth - half,
          9,
        );
        lefts.slice(1).forEach((left, i) => {
          expect(left - (lefts[i] ?? 0)).toBeCloseTo(
            CAMPER_SPEC.bumperBoxSize,
            9,
          );
        });
      }),
    );
  });

  it("parks a real camper with its boxes on the bumper row for its snapped yaw", () => {
    fc.assert(
      fc.property(yaw, cell, cell, (y, cx, cz) => {
        const vehicle = createVehicle("camper", asVehicleId("c"), y);
        const at = { x: cx + 0.5, y: 64, z: cz + 0.5 };
        let pose: StandInPose | undefined;
        let hold: Vec3 | undefined;
        for (let tick = 0; tick < DOCK.ticks + 5; tick++) {
          const out = vehicle.tick(input(tick, at));
          pose = out.standIn;
          hold = out.dock?.hold;
        }
        const parked = { ...defined(hold, "hold"), yaw: vehicle.yaw };
        expect(yawGap(vehicle.yaw, Math.round(vehicle.yaw / 90) * 90)).toBe(0);
        const row = CAMPER_SPEC.bumperBoxXs.map((x) =>
          JSON.stringify(localCellAt(parked, { x, z: 4, layer: 0 })),
        );
        const cells = boxCenters(defined(pose, "stand-in")).map((c) =>
          JSON.stringify({
            x: Math.floor(c.x),
            y: Math.floor(c.y),
            z: Math.floor(c.z),
          }),
        );
        expect(new Set(cells)).toEqual(new Set(row));
        expect(parkPose(at, y).yaw).toBe(parked.yaw);
      }),
      { numRuns: 30 },
    );
  });

  /** Solid layers in the bumper's middle cell, `solid(layer)` counted from the camper's feet. */
  function columnAt(
    at: Vec3,
    snapped: number,
    solid: (layer: number) => boolean,
  ) {
    const middle = localCellAt(
      { ...at, yaw: snapped },
      { x: 0, z: 4, layer: 0 },
    );
    return {
      middle,
      solidAt: (o: Vec3) => {
        const x = Math.floor(at.x + o.x);
        const y = Math.floor(at.y + o.y);
        const z = Math.floor(at.z + o.z);
        return x === middle.x && z === middle.z && solid(y - middle.y);
      },
    };
  }

  it("rises out of solid ground in the bumper's middle cell while driving, at most maxLift blocks, but not over plants (ADR 0119)", () => {
    const maxLift = defined(RULE.maxLift, "max lift");
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        cell,
        cell,
        cell,
        fc.integer({ min: 0, max: 4 }),
        (quarter, cx, cy, cz, rise) => {
          const snapped = quarter * 90;
          const at = { x: cx + 0.5, y: cy, z: cz + 0.5 };
          // The side cells hold only plants, which solidAt does not count.
          const { middle, solidAt } = columnAt(
            at,
            snapped,
            (layer) => layer >= 0 && layer < rise,
          );
          const pose = defined(
            stubCamper([snapped]).next(at, solidAt).standIn,
            "stand-in",
          );
          expect(pose.y).toBe(cy + Math.min(rise, maxLift));
          expect(Math.floor(pose.x)).toBe(middle.x);
          expect(Math.floor(pose.z)).toBe(middle.z);
        },
      ),
    );
  });

  it("rises out of ground in the wall foot while parked, but not into the front end wall above it (ADR 0119)", () => {
    const parkedMaxLift = defined(RULE.parkedMaxLift, "parked max lift");
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        cell,
        cell,
        cell,
        fc.boolean(),
        fc.integer({ min: 0, max: 4 }),
        (quarter, cx, cy, cz, ground, wallTop) => {
          const snapped = quarter * 90;
          const hold = { x: cx + 0.5, y: cy, z: cz + 0.5 };
          // The dock's wall blocks fill layers 1 up to wallTop above the foot.
          const { middle, solidAt } = columnAt(hold, snapped, (layer) =>
            layer === 0 ? ground : layer >= 1 && layer <= wallTop,
          );
          const pose = defined(
            stubCamper([snapped], hold).next(hold, solidAt).standIn,
            "stand-in",
          );
          expect(pose.y).toBe(cy + Math.min(ground ? 1 : 0, parkedMaxLift));
          expect(Math.floor(pose.x)).toBe(middle.x);
          expect(Math.floor(pose.z)).toBe(middle.z);
        },
      ),
    );
  });

  it("never rises without a lift limit, driving or held, however much ground is in front", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        fc.record({ x: cell, y: cell, z: cell }),
        fc.boolean(),
        fc.option(fc.integer({ min: 0, max: 4 }), { nil: undefined }),
        (quarter, at, held, parked) => {
          const snapped = quarter * 90;
          const profile = camperWithLifts(
            parked === undefined ? {} : { parkedMaxLift: parked },
          );
          const camper = stubCamper([snapped], held ? at : undefined, profile);
          const pose = defined(camper.next(at, () => true).standIn, "s");
          expect(pose.y).toBe(at.y);
        },
      ),
    );
  });

  it("rises up to maxLift while held when no parked limit is set", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -8, max: 8 }),
        cell,
        cell,
        cell,
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 6 }),
        (quarter, cx, cy, cz, maxLift, rise) => {
          const snapped = quarter * 90;
          const hold = { x: cx + 0.5, y: cy, z: cz + 0.5 };
          const { solidAt } = columnAt(
            hold,
            snapped,
            (layer) => layer >= 0 && layer < rise,
          );
          const camper = stubCamper(
            [snapped],
            hold,
            camperWithLifts({ maxLift }),
          );
          const pose = defined(camper.next(hold, solidAt).standIn, "s");
          expect(pose.y).toBe(cy + Math.min(rise, maxLift));
        },
      ),
    );
  });

  it("stays at the feet with nothing solid in front, whatever the yaw", () => {
    fc.assert(
      fc.property(yaw, fc.record({ x: cell, y: cell, z: cell }), (y, at) => {
        const pose = defined(stubCamper([y]).next(at).standIn, "stand-in");
        expect(pose.y).toBe(at.y);
      }),
    );
  });
});
