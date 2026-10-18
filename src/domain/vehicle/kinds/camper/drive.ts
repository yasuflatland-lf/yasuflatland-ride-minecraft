import type { RestoredValues } from "../../drive";
import { TransformingDrive } from "../../motion/transformingDrive";
import { type BodyEnds, guardEnds } from "./bodyGuard";
import { CAMPER_MOTION } from "./profile";
import { CAMPER_SPEC, CAMPER_TRANSFORMING } from "./spec";

const CAMPER_ENDS: BodyEnds = {
  front: CAMPER_SPEC.bodyFront,
  rear: CAMPER_SPEC.bodyRear,
  halfWidth: CAMPER_SPEC.bodyHalfWidth,
  height: CAMPER_SPEC.carHeight,
};

// The shared transforming drivetrain with the camper's values and its end check (ADR 0067).
// No doors open when a seat is vacated; the entry door comes with parking.
export class CamperDrive extends TransformingDrive {
  constructor(yaw: number, restored: RestoredValues) {
    super(yaw, restored, CAMPER_TRANSFORMING, CAMPER_MOTION, (step, ctx) =>
      guardEnds(step, ctx, CAMPER_ENDS),
    );
  }
}
