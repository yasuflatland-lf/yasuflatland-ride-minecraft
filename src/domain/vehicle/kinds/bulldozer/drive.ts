import { SyncedValue } from "../../../shared/syncedValue";
import { clamp, normalizeYaw } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
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

const TRACK_SIDES = ["r", "l"] as const;

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
  if (Math.abs(raw.moveX) > BULLDOZER_SPEC.pivotStick)
    return {
      throttle: 0,
      steer: clamp(raw.moveX, -1, 1),
      handbrake: false,
      creep: false,
    };
  const { throttle } = toDriveInput(raw);
  return {
    throttle: form === "car" ? throttle : Math.max(0, throttle),
    steer: 0,
    handbrake: false,
    creep: false,
  };
}

function pivotOrDriveStep(h: HorizontalStepInput): MotionResult {
  if (h.input.steer === 0) return transformingHorizontalStep(h);
  const velocity = { x: h.ctx.velocity.x, z: h.ctx.velocity.z };
  if (h.form === "car")
    return pivotGroundStep(
      h.state,
      h.input.steer,
      { velocity, onGround: h.ctx.onGround },
      h.probe,
      h.limits,
      h.tyres,
    );
  return pivotMediumStep(
    h.state,
    h.input.steer,
    velocity,
    h.form === "submarine" ? h.spec.water : h.spec.air,
    h.limits,
  );
}

export function bulldozerHorizontalStep(h: HorizontalStepInput): MotionResult {
  const result = pivotOrDriveStep(h);
  if (!h.jumpTapped || h.form !== "car" || !h.ctx.onGround) return result;
  // stepMotion counts the step tick itself after setting MOTION.stepTicks, leaving 9 ticks (ADR 0136).
  return {
    ...result,
    jumpVelocity: BULLDOZER_SPEC.hopVelocity,
    state: { ...result.state, stepTicks: BULLDOZER_SPEC.hopTicks - 1 },
  };
}

export function cutReach(
  form: Form,
  onGround: boolean,
): "sky" | "tunnel" | undefined {
  switch (form) {
    case "car":
      return onGround ? "sky" : undefined;
    case "submarine":
      return undefined;
    default:
      return "tunnel";
  }
}

export class BulldozerDrive extends TransformingDrive {
  private travel: TrackTravel = { r: 0, l: 0 };
  private doorTimer = 0;
  private doorSteps = 0;
  private readonly doorSync = new SyncedValue<number>();
  private readonly phaseSync = {
    r: new SyncedValue<0 | 1 | 2>(),
    l: new SyncedValue<0 | 1 | 2>(),
  };
  private readonly spinSync = {
    r: new SyncedValue<number>(),
    l: new SyncedValue<number>(),
  };

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
    for (const side of TRACK_SIDES) {
      this.phaseSync[side].resync();
      this.spinSync[side].resync();
    }
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const yawBefore = this.yaw;
    const out = super.step(raw, ctx);
    const cut = this.bladeCut(raw, ctx);
    if (this.form === "car")
      this.travel = advanceTracks(
        this.travel,
        this.speed,
        normalizeYaw(this.yaw - yawBefore),
        BULLDOZER_SPEC.tracks,
      );
    this.doorTimer = Math.max(0, this.doorTimer - 1);
    const doorTarget = this.doorTimer > 0 ? BULLDOZER_SPEC.doorSteps : 0;
    this.doorSteps += Math.sign(doorTarget - this.doorSteps);
    const commands = [...out.commands, ...this.bodyCommands()];
    return { ...out, ...(cut === undefined ? {} : { cut }), commands };
  }

  private bladeCut(
    raw: RawInput | undefined,
    ctx: TickContext,
  ): CutColumn[] | undefined {
    const reach = cutReach(this.form, ctx.onGround);
    if (
      raw !== undefined &&
      bulldozerInput(raw, this.form).steer === 0 &&
      this.speed > BULLDOZER_SPEC.blade.minSpeed &&
      reach !== undefined
    )
      return bladeColumns(
        ctx.location,
        this.yaw,
        BULLDOZER_SPEC.blade,
        reach === "tunnel",
      );
    return undefined;
  }

  private bodyCommands(): EngineCommand[] {
    const { phaseStep, radius } = BULLDOZER_SPEC.tracks;
    const commands: EngineCommand[] = [];
    const door = this.doorSync.next(this.doorSteps / BULLDOZER_SPEC.doorSteps);
    if (door !== undefined) commands.push(doorCommand(door));
    for (const side of TRACK_SIDES) {
      const phase = this.phaseSync[side].next(
        trackPhase(this.travel[side], phaseStep),
      );
      if (phase !== undefined) commands.push(trackPhaseCommand(side, phase));
    }
    for (const side of TRACK_SIDES) {
      const spin = this.spinSync[side].next(
        trackSpin(this.travel[side], radius),
      );
      if (spin !== undefined) commands.push(trackSpinCommand(side, spin));
    }
    return commands;
  }
}
