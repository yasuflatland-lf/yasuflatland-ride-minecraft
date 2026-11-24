import type { Ticks } from "../../shared/ticks";
import type { MotionLimits } from "./limits";
import type { Medium } from "./motion";
import type { WaterPolicy } from "./water";

/** `constant` moves the bank angle by `bankRate` degrees every tick. */
type BankEasing = "constant" | "smooth";

/**
 * Values a transforming drivetrain reads (ADR 0021, 0026, 0032, 0033, 0040,
 * 0044). Each transforming kind builds one from its own spec.
 */
export interface TransformingSpec {
  /** Body height in blocks; the vehicle counts as submerged at this water depth. */
  readonly carHeight: number;
  readonly doubleTapTicks: Ticks;
  readonly takeoffTicks: Ticks;
  readonly takeoffClimb: number;
  readonly landingSink: number;
  readonly maxClimb: number;
  readonly flightVerticalDrag: number;
  readonly waterVerticalDrag: number;
  readonly floatDraft: number;
  readonly floatGain: number;
  readonly surfaceRise: number;
  readonly submarineStepProbeDrop: number;
  readonly maxBank: number;
  readonly bankRate: number;
  /** How the bank angle approaches its target; per kind (ADR 0050). */
  readonly bankEasing: BankEasing;
  readonly bankSink: number;
  readonly gearDownHeight: number;
  readonly gearProbeOffset: number;
  /** Blocks from the center to the front edge the step probe uses (ADR 0004). */
  readonly hitboxFront: number;
  /** Side offset of the two outer step-up rays; keep it within the body's half width (ADR 0004). */
  readonly stepLaneOffset: number;
  readonly air: Medium;
  readonly water: Medium;
  /** Per-kind choice of diving or surface support, independent of water speed (ADR 0050). */
  readonly waterPolicy: WaterPolicy;
}

type Mediums = Pick<TransformingSpec, "air" | "water">;
type MediumSpec = Pick<MotionLimits, "maxSpeed"> & {
  readonly flightDrag: number;
  readonly waterDrag: number;
  readonly maxWaterSpeed: number;
};

export function mediumsOf(spec: MediumSpec): Mediums {
  return {
    air: Object.freeze({ drag: spec.flightDrag, maxSpeed: spec.maxSpeed }),
    water: Object.freeze({
      drag: spec.waterDrag,
      maxSpeed: spec.maxWaterSpeed,
    }),
  };
}

type TransformingOptions = Pick<TransformingSpec, "bankEasing" | "waterPolicy">;
type TransformingTuning = Pick<
  TransformingSpec,
  Exclude<keyof TransformingSpec, keyof Mediums | keyof TransformingOptions>
>;

export function transformingSpecOf(
  spec: TransformingTuning & MediumSpec,
  { bankEasing, waterPolicy }: TransformingOptions,
): TransformingSpec {
  return Object.freeze({
    carHeight: spec.carHeight,
    doubleTapTicks: spec.doubleTapTicks,
    takeoffTicks: spec.takeoffTicks,
    takeoffClimb: spec.takeoffClimb,
    landingSink: spec.landingSink,
    maxClimb: spec.maxClimb,
    flightVerticalDrag: spec.flightVerticalDrag,
    waterVerticalDrag: spec.waterVerticalDrag,
    floatDraft: spec.floatDraft,
    floatGain: spec.floatGain,
    surfaceRise: spec.surfaceRise,
    submarineStepProbeDrop: spec.submarineStepProbeDrop,
    maxBank: spec.maxBank,
    bankRate: spec.bankRate,
    bankEasing,
    bankSink: spec.bankSink,
    gearDownHeight: spec.gearDownHeight,
    gearProbeOffset: spec.gearProbeOffset,
    hitboxFront: spec.hitboxFront,
    stepLaneOffset: spec.stepLaneOffset,
    ...mediumsOf(spec),
    waterPolicy,
  });
}
