// The SUV's drive: the shared transforming drivetrain with the SUV's values, plus its doors (ADR 0050).
import type { EngineCommand, RestoredValues } from "../../drive";
import { TransformingDrive } from "../../motion/transformingDrive";
import { doorCommands } from "./entity";
import { SUV_MOTION } from "./profile";
import { SUV_TRANSFORMING } from "./spec";

export class SuvDrive extends TransformingDrive {
  constructor(yaw: number, restored: RestoredValues) {
    super(yaw, restored, SUV_TRANSFORMING, SUV_MOTION);
  }

  override onSeatVacated(seat: number): readonly EngineCommand[] {
    return doorCommands(seat);
  }
}
