import type { DriveStep, RestoredValues, TickContext } from "../../drive";
import type { RawInput } from "../../driveInput";
import { isDry } from "../../motion/forms";
import { TransformingDrive } from "../../motion/transformingDrive";
import { SyncedCommands } from "../../syncedCommands";
import { leanCommand, standCommand, steerCommand } from "./entity";
import { bodyRoll, type Lean, rollLevel, stepLean } from "./lean";
import { SCOOTER_MOTION, SCOOTER_TYRES } from "./profile";
import { SCOOTER_SPEC, SCOOTER_TRANSFORMING } from "./spec";
import { standDown } from "./stand";
import { steerAngle } from "./steer";

export class ScooterDrive extends TransformingDrive {
  private lean: Lean = { angle: 0 };
  private steer = 0;
  private stand = false;
  private readonly bodySync = new SyncedCommands<ScooterDrive>()
    .add((drive) => drive.lean.angle, leanCommand)
    .add((drive) => drive.steer, steerCommand)
    .add((drive) => drive.stand, standCommand);

  constructor(yaw: number, restored: RestoredValues<"form">) {
    super(yaw, restored, SCOOTER_TRANSFORMING, SCOOTER_MOTION, SCOOTER_TYRES);
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const step = super.step(raw, ctx);
    const car = this.form === "car";
    const { input, waterDepth } = this.readings;
    // Ground and flight share lean tuning; neutral input during take-off or
    // without a driver eases the body and riders upright without a jump.
    this.lean = stepLean(this.lean, input.steer, this.speed, SCOOTER_SPEC);
    this.steer = steerAngle(input.steer, SCOOTER_SPEC);
    const onWater = !isDry(waterDepth);
    this.stand =
      car &&
      standDown(
        raw !== undefined || ctx.awaitingDriver === true,
        this.speed,
        onWater,
      );
    return {
      ...step,
      riderLean: rollLevel(
        bodyRoll(this.lean, this.bankAngle),
        SCOOTER_SPEC.rollLevelAngles,
      ),
      commands: [...step.commands, ...this.bodySync.next(this)],
    };
  }

  override resync(): void {
    super.resync();
    this.bodySync.resync();
  }

  override inspect(): Readonly<{
    wheelsDown: boolean;
    bank: number;
    lean: number;
    steer: number;
    stand: boolean;
  }> {
    return {
      ...super.inspect(),
      lean: this.lean.angle,
      steer: this.steer,
      stand: this.stand,
    };
  }
}
