import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clamp } from "../../../src/domain/shared/vec";
import type { RawInput } from "../../../src/domain/vehicle/driveInput";
import {
  NEUTRAL_CONTROL,
  toDriveInput,
} from "../../../src/domain/vehicle/driveInput";
import { SPEC } from "../../../src/domain/vehicle/spec";

const axis = fc.double({ min: -1, max: 1, noNaN: true });

// A stick within 20 degrees of horizontal, held past the deadzone.
const sideways = fc
  .record({
    x: fc.double({ min: 0.11, max: 1, noNaN: true }),
    slope: fc.double({ min: -0.36, max: 0.36, noNaN: true }),
    left: fc.boolean(),
  })
  .map(({ x, slope, left }) => ({
    moveX: left ? x : -x,
    moveY: x * slope,
  }));

describe("toDriveInput (ADR 0018)", () => {
  it("yields the neutral input when there is no input", () => {
    expect(toDriveInput(undefined)).toBe(NEUTRAL_CONTROL);
  });

  it("yields neutral input when the left/right or forward/backward input is NaN or positive/negative Infinity", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Number.NaN, Infinity, -Infinity),
        fc.double(),
        fc.boolean(),
        (invalid, other, jump) => {
          expect(toDriveInput({ moveX: invalid, moveY: other, jump })).toEqual(
            NEUTRAL_CONTROL,
          );
          expect(toDriveInput({ moveX: other, moveY: invalid, jump })).toEqual(
            NEUTRAL_CONTROL,
          );
        },
      ),
    );
  });

  it("throttle is 0 when the absolute forward/backward input is at most 0.1", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        axis,
        (y, x) => {
          expect(
            toDriveInput({ moveX: x, moveY: y, jump: false }).throttle,
          ).toBe(0);
        },
      ),
    );
  });

  it("a stick within 20 degrees of horizontal reads as sideways with no throttle", () => {
    fc.assert(
      fc.property(sideways, fc.boolean(), (stick, jump) => {
        const d = toDriveInput({ ...stick, jump });
        expect(d.throttle).toBe(0);
        expect(d.sideways).toBe(true);
        expect(d.steer).toBe(stick.moveX);
      }),
    );
  });

  it("a stick pushed right on a phone, which reads slightly backward, creeps instead of reversing (measured in game)", () => {
    const d = toDriveInput({ moveX: -0.99, moveY: -0.2, jump: false });
    expect(d).toEqual({
      throttle: 0,
      steer: -0.99,
      jump: false,
      sideways: true,
    });
  });

  it("yields no throttle, no steering, no jump, and no sideways stick as the neutral control", () => {
    expect(NEUTRAL_CONTROL).toEqual({
      throttle: 0,
      steer: 0,
      jump: false,
      sideways: false,
    });
  });

  it("includes the deadzone edges: 0.1 forward/backward gives no throttle and 0.1 sideways does not creep", () => {
    for (const edge of [-0.1, 0.1]) {
      expect(toDriveInput({ moveX: 0, moveY: edge, jump: false })).toEqual({
        throttle: 0,
        steer: 0,
        jump: false,
        sideways: false,
      });
      expect(toDriveInput({ moveX: edge, moveY: 0, jump: false })).toEqual({
        throttle: 0,
        steer: edge,
        jump: false,
        sideways: false,
      });
    }
  });

  it("creeps with the stick exactly 20 degrees above or below horizontal", () => {
    const slope = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);
    for (const x of [-1, 1]) {
      for (const y of [-slope, slope]) {
        expect(toDriveInput({ moveX: x, moveY: y, jump: false })).toEqual({
          throttle: 0,
          steer: x,
          jump: false,
          sideways: true,
        });
      }
    }
  });

  it("drives or reverses instead of creeping with the stick more than 20 degrees from horizontal", () => {
    const slope = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);
    fc.assert(
      fc.property(
        fc.double({ min: 0.11, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        fc.boolean(),
        (x, t, left, back) => {
          const lowest = x * slope + 1e-6;
          const y = lowest + t * (1 - lowest);
          const d = toDriveInput({
            moveX: left ? x : -x,
            moveY: back ? -y : y,
            jump: false,
          });
          expect(d.sideways).toBe(false);
          if (y > SPEC.throttleDeadzone)
            expect(Math.sign(d.throttle)).toBe(back ? -1 : 1);
        },
      ),
    );
  });

  it("does not creep without sideways input", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        axis,
        (x, y) => {
          expect(
            toDriveInput({ moveX: x, moveY: y, jump: false }).sideways,
          ).toBe(false);
        },
      ),
    );
  });

  it("throttle is full when the absolute forward/backward input is at least 0.5 (preserving the input sign)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 1, noNaN: true }),
        fc.boolean(),
        (a, neg) => {
          const y = neg ? -a : a;
          expect(
            toDriveInput({ moveX: 0, moveY: y, jump: false }).throttle,
          ).toBe(neg ? -1 : 1);
        },
      ),
    );
  });

  it("throttle is monotonically nondecreasing with forward/backward input", () => {
    fc.assert(
      fc.property(axis, axis, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(
          toDriveInput({ moveX: 0, moveY: lo, jump: false }).throttle,
        ).toBeLessThanOrEqual(
          toDriveInput({ moveX: 0, moveY: hi, jump: false }).throttle,
        );
      }),
    );
  });

  it("throttle is full even with sharp steering on mobile when pushed at least halfway forward (measurements from the spike)", () => {
    expect(
      toDriveInput({ moveX: 0.9, moveY: 0.48, jump: false }).throttle,
    ).toBeCloseTo(0.96);
    expect(
      toDriveInput({ moveX: 0.81, moveY: 0.54, jump: false }).throttle,
    ).toBe(1);
  });

  it("left/right input maps directly to steering, and jump passes through", () => {
    fc.assert(
      fc.property(axis, fc.boolean(), (x, jump) => {
        const d = toDriveInput({ moveX: x, moveY: 0, jump });
        expect(d.steer).toBe(x);
        expect(d.jump).toBe(jump);
      }),
    );
  });
});

// The mapping before ADR 0089, kept as an oracle.
interface LegacyDriveInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
  creep: boolean;
}
const LEGACY_NEUTRAL: LegacyDriveInput = {
  throttle: 0,
  steer: 0,
  handbrake: false,
  creep: false,
};
const LEGACY_SLOPE = Math.tan((SPEC.sidewaysAngle * Math.PI) / 180);
function legacyToDriveInput(raw: RawInput | undefined): LegacyDriveInput {
  if (
    raw === undefined ||
    !Number.isFinite(raw.moveX) ||
    !Number.isFinite(raw.moveY)
  ) {
    return LEGACY_NEUTRAL;
  }
  const steer = clamp(raw.moveX, -1, 1);
  const sideways = Math.abs(steer);
  // A phone stick pushed straight right reads about -0.2 forward/backward,
  // which would otherwise reverse the vehicle and flip the steering.
  if (
    sideways > SPEC.throttleDeadzone &&
    Math.abs(raw.moveY) <= sideways * LEGACY_SLOPE
  ) {
    return { throttle: 0, steer, handbrake: raw.jump, creep: true };
  }
  const magnitude = Math.abs(raw.moveY);
  const throttle =
    magnitude <= SPEC.throttleDeadzone
      ? 0
      : Math.sign(raw.moveY) * Math.min(1, magnitude / SPEC.throttleFullAt);
  return { throttle, steer, handbrake: raw.jump, creep: false };
}

const anyAxis = fc.oneof(
  fc.double({ min: -1.5, max: 1.5, noNaN: true }),
  fc.double(),
);
const anyRaw: fc.Arbitrary<RawInput> = fc.record({
  moveX: anyAxis,
  moveY: anyAxis,
  jump: fc.boolean(),
});
const anyRawOrNone = fc.option(anyRaw, { nil: undefined });

it("the control input is the old drive input with jump and sideways in place of handbrake and creep (ADR 0089)", () => {
  fc.assert(
    fc.property(anyRawOrNone, (raw) => {
      const o = legacyToDriveInput(raw);
      expect(toDriveInput(raw)).toStrictEqual({
        throttle: o.throttle,
        steer: o.steer,
        jump: o.handbrake,
        sideways: o.creep,
      });
    }),
    { numRuns: 100 },
  );
});
