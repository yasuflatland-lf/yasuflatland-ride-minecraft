import { SyncedValue } from "../../../shared/syncedValue";
import { clamp, normalizeYaw } from "../../../shared/vec";
import type { DriveStep, EngineCommand, TickContext } from "../../drive";
import { type RawInput, toDriveInput } from "../../driveInput";
import type { RestoredOf } from "../../entityContract";
import type { Form } from "../../motion/forms";
import type { GroundInput, MotionResult } from "../../motion/motion";
import { pivotGroundStep, pivotMediumStep } from "../../motion/pivot";
import {
  type HorizontalStepInput,
  TransformingDrive,
  transformingHorizontalStep,
} from "../../motion/transformingDrive";
import { bladeColumns } from "./blade";
import {
  type BULLDOZER_ENTITY,
  doorCommand,
  trackPhaseCommand,
  trackSpinCommand,
} from "./entity";
import { BULLDOZER_MOTION, BULLDOZER_TYRES } from "./profile";
import { BULLDOZER_SPEC, BULLDOZER_TRANSFORMING } from "./spec";
import {
  advanceTracks,
  type TrackTravel,
  trackPhase,
  trackSpin,
} from "./tracks";
export function bulldozerInput(
  raw: RawInput | undefined,
  form: Form,
): GroundInput {
  if (
    raw === undefined ||
    !Number.isFinite(raw.moveX) ||
    !Number.isFinite(raw.moveY) ||
    form === "takeoff"
  )
    return { throttle: 0, steer: 0, handbrake: false, creep: false };
  const steer =
    Math.abs(raw.moveX) > BULLDOZER_SPEC.pivotStick
      ? clamp(raw.moveX, -1, 1)
      : 0;
  const throttle =
    steer !== 0
      ? 0
      : form === "car"
        ? toDriveInput(raw).throttle
        : Math.max(0, toDriveInput(raw).throttle);
  return { throttle, steer, handbrake: false, creep: false };
}
export function bulldozerHorizontalStep(h: HorizontalStepInput): MotionResult {
  const velocity = { x: h.ctx.velocity.x, z: h.ctx.velocity.z };
  let result =
    h.input.steer === 0
      ? transformingHorizontalStep(h)
      : h.form === "car"
        ? pivotGroundStep(
            h.state,
            h.input.steer,
            { velocity, onGround: h.ctx.onGround },
            h.probe,
            h.limits,
            h.tyres,
          )
        : pivotMediumStep(
            h.state,
            h.input.steer,
            velocity,
            h.form === "submarine" ? h.spec.water : h.spec.air,
            h.limits,
          );
  if (h.jumpTapped && h.form === "car" && h.ctx.onGround) {
    // stepMotion counts the step tick itself after setting MOTION.stepTicks, leaving 9 ticks (ADR 0136).
    result = {
      ...result,
      jumpVelocity: BULLDOZER_SPEC.hopVelocity,
      state: { ...result.state, stepTicks: BULLDOZER_SPEC.hopTicks - 1 },
    };
  }
  return result;
}
export function cutReach(
  form: Form,
  onGround: boolean,
): "sky" | "tunnel" | undefined {
  return form === "car"
    ? onGround
      ? "sky"
      : undefined
    : form === "submarine"
      ? undefined
      : "tunnel";
}
export class BulldozerDrive extends TransformingDrive {
  private travel: TrackTravel = { r: 0, l: 0 };
  private doorTimer = 0;
  private doorSteps = 0;
  private readonly doorSync = new SyncedValue<number>();
  private readonly rightPhaseSync = new SyncedValue<0 | 1 | 2>();
  private readonly leftPhaseSync = new SyncedValue<0 | 1 | 2>();
  private readonly rightSpinSync = new SyncedValue<number>();
  private readonly leftSpinSync = new SyncedValue<number>();
  constructor(yaw: number, restored: RestoredOf<typeof BULLDOZER_ENTITY>) {
    super(
      yaw,
      restored,
      BULLDOZER_TRANSFORMING,
      BULLDOZER_MOTION,
      BULLDOZER_TYRES,
      {
        inputFor: bulldozerInput,
        horizontal: bulldozerHorizontalStep,
        stepUp: false,
      },
    );
    // Reassert gravity as well as the restored form after a server restart (ADR 0136).
    this.resync();
  }
  onSeatTaken(_seat: number): readonly EngineCommand[] {
    this.doorTimer = BULLDOZER_SPEC.doorOpenTicks;
    return [];
  }
  override onSeatVacated(_seat: number): readonly EngineCommand[] {
    this.doorTimer = BULLDOZER_SPEC.doorOpenTicks;
    return [];
  }
  override resync(): void {
    super.resync();
    this.doorSync.resync();
    this.rightPhaseSync.resync();
    this.leftPhaseSync.resync();
    this.rightSpinSync.resync();
    this.leftSpinSync.resync();
  }
  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const yawBefore = this.yaw;
    const out = super.step(raw, ctx);
    const reach = cutReach(this.form, ctx.onGround);
    const cut =
      raw !== undefined &&
      bulldozerInput(raw, this.form).steer === 0 &&
      this.speed > BULLDOZER_SPEC.blade.minSpeed &&
      reach !== undefined
        ? bladeColumns(
            ctx.location,
            this.yaw,
            BULLDOZER_SPEC.blade,
            reach === "tunnel",
          )
        : undefined;
    if (this.form === "car")
      this.travel = advanceTracks(
        this.travel,
        this.speed,
        normalizeYaw(this.yaw - yawBefore),
        BULLDOZER_SPEC.tracks,
      );
    this.doorTimer = Math.max(0, this.doorTimer - 1);
    const target = this.doorTimer > 0 ? BULLDOZER_SPEC.doorSteps : 0;
    this.doorSteps += Math.sign(target - this.doorSteps);
    const commands = [...out.commands];
    const door = this.doorSync.next(this.doorSteps / BULLDOZER_SPEC.doorSteps);
    const r = this.rightPhaseSync.next(
        trackPhase(this.travel.r, BULLDOZER_SPEC.tracks.phaseStep),
      ),
      l = this.leftPhaseSync.next(
        trackPhase(this.travel.l, BULLDOZER_SPEC.tracks.phaseStep),
      );
    const sr = this.rightSpinSync.next(
        trackSpin(this.travel.r, BULLDOZER_SPEC.tracks.radius),
      ),
      sl = this.leftSpinSync.next(
        trackSpin(this.travel.l, BULLDOZER_SPEC.tracks.radius),
      );
    if (door !== undefined) commands.push(doorCommand(door));
    if (r !== undefined) commands.push(trackPhaseCommand("r", r));
    if (l !== undefined) commands.push(trackPhaseCommand("l", l));
    if (sr !== undefined) commands.push(trackSpinCommand("r", sr));
    if (sl !== undefined) commands.push(trackSpinCommand("l", sl));
    return { ...out, ...(cut === undefined ? {} : { cut }), commands };
  }
}
