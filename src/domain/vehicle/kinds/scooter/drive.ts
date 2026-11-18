import { SyncedValue } from "../../../shared/syncedValue";
import type { DriveStep, RestoredValues, TickContext } from "../../drive";
import type { RawInput } from "../../driveInput";
import { isDry } from "../../motion/forms";
import {
  groundInputFor,
  TransformingDrive,
} from "../../motion/transformingDrive";
import { waterDepthAt } from "../../motion/water";
import { leanCommand, standCommand, steerCommand } from "./entity";
import { type Lean, leanLevel, stepLean } from "./lean";
import { SCOOTER_MOTION, SCOOTER_TYRES } from "./profile";
import { SCOOTER_SPEC, SCOOTER_TRANSFORMING } from "./spec";
import { standDown } from "./stand";
import { steerAngle } from "./steer";

export class ScooterDrive extends TransformingDrive {
  private lean: Lean = { angle: 0 };
  private steer = 0;
  private stand = false;
  private readonly leanSync = new SyncedValue<number>();
  private readonly steerSync = new SyncedValue<number>();
  private readonly standSync = new SyncedValue<boolean>();

  constructor(yaw: number, restored: RestoredValues<"form">) {
    super(yaw, restored, SCOOTER_TRANSFORMING, SCOOTER_MOTION, SCOOTER_TYRES);
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const step = super.step(raw, ctx);
    const car = this.form === "car";
    const input = groundInputFor(raw, this.form);
    // Ground and flight share lean tuning; neutral input during take-off or
    // without a driver eases the body and riders upright without a jump.
    this.lean = stepLean(this.lean, input.steer, this.speed, SCOOTER_SPEC);
    this.steer = steerAngle(input.steer, SCOOTER_SPEC);
    const onWater = !isDry(
      waterDepthAt(ctx.location, ctx.waterAt, SCOOTER_SPEC.carHeight),
    );
    this.stand =
      car &&
      standDown(
        raw !== undefined || ctx.awaitingDriver === true,
        this.speed,
        onWater,
      );
    const lean = this.leanSync.next(this.lean.angle);
    const steer = this.steerSync.next(this.steer);
    const stand = this.standSync.next(this.stand);
    return {
      ...step,
      riderLean: leanLevel(
        this.lean,
        SCOOTER_SPEC.leanLevels,
        SCOOTER_SPEC.maxLean,
      ),
      commands: [
        ...step.commands,
        ...(lean === undefined ? [] : [leanCommand(lean)]),
        ...(steer === undefined ? [] : [steerCommand(steer)]),
        ...(stand === undefined ? [] : [standCommand(stand)]),
      ],
    };
  }

  override resync(): void {
    super.resync();
    this.leanSync.resync();
    this.steerSync.resync();
    this.standSync.resync();
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
