// Banking into turns in flight, like an airplane (ADR 0026), and under water (ADR 0044).
import { approach, clamp } from "../../shared/vec";
import { MOTION } from "./constants";
import type { Form } from "./forms";
import type { TransformingSpec } from "./transforming";
import { turnFraction } from "./turn";

/**
 * Next bank angle in degrees; positive lowers the right side. In flight and
 * under water the target follows how fast the heading turns, so a turn at the
 * full `turnRate` banks fully whatever the speed or direction of travel. In
 * every other form the target is level. Easing is selected per kind (ADR 0213).
 */
export function stepBank(
  prev: number,
  form: Form,
  yawBefore: number,
  yawAfter: number,
  turnRate: number,
  spec: Pick<TransformingSpec, "maxBank" | "bankRate" | "bankEasing">,
): number {
  const turn = turnFraction(yawBefore, yawAfter, turnRate);
  const target =
    (form === "hover" || form === "submarine") && turn !== undefined
      ? clamp(turn, -1, 1) * spec.maxBank
      : 0;
  switch (spec.bankEasing) {
    case "constant":
      return approach(prev, target, spec.bankRate);
    case "smooth": {
      const tuning = MOTION.bankSmooth;
      const fraction =
        spec.maxBank === 0 ? 0 : clamp(Math.abs(prev) / spec.maxBank, 0, 1);
      const bell = 4 * fraction * (1 - fraction);
      const distance = Math.abs(target - prev);
      const step = Math.max(
        tuning.minStep,
        Math.min(
          spec.bankRate * (tuning.baseRateScale + tuning.bellRateScale * bell),
          distance * tuning.easeOutFraction,
        ),
      );
      if (distance <= step) return target === 0 ? 0 : target; // a negative turn times maxBank 0 is -0
      return approach(prev, target, step);
    }
  }
}

/** Altitude lost per tick while flying banked, in proportion to the bank angle. */
export function bankSink(
  form: Form,
  bank: number,
  spec: Pick<TransformingSpec, "maxBank" | "bankSink">,
): number {
  // A kind that never banks (maxBank 0) never sinks; the ratio below would be 0/0.
  if (form !== "hover" || spec.maxBank === 0) return 0;
  return (Math.abs(bank) / spec.maxBank) * spec.bankSink;
}
