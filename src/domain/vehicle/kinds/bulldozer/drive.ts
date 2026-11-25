import { cellOf, offsetToCellCenter } from "../../../shared/cells";
import { clamp, normalizeYaw, type Vec3 } from "../../../shared/vec";
import type { CutColumn } from "../../cut";
import type { DriveStep, EngineCommand, TickContext } from "../../drive";
import { type RawInput, toDriveInput } from "../../driveInput";
import type { RestoredOf } from "../../entityContract";
import { equipmentBindings } from "../../equipment/equipment";
import { climbInput, type Form } from "../../motion/forms";
import type { GroundInput, MotionResult } from "../../motion/motion";
import { pivotGroundStep, pivotMediumStep } from "../../motion/pivot";
import {
  type HorizontalStepInput,
  TransformingDrive,
  transformingHorizontalStep,
} from "../../motion/transformingDrive";
import type { Pave } from "../../pave";
import { SyncedCommands } from "../../syncedCommands";
import { bladeColumns, type CutReach, shaftColumns } from "./blade";
import {
  type BULLDOZER_ENTITY,
  bladeCommand,
  doorCommand,
  roadPaverCommand,
  trackPhaseCommand,
  trackSpinCommand,
  wideBladeCommand,
} from "./entity";
import {
  BLADE_SWITCH_ITEM,
  BULLDOZER_EQUIPMENT,
  ROAD_PAVER_SWITCH_ITEM,
  WIDE_BLADE_SWITCH_ITEM,
} from "./equipment";
import { type CellClass, paveStep } from "./paver";
import { BULLDOZER_MOTION, BULLDOZER_TYRES } from "./profile";
import {
  type BladeRule,
  BULLDOZER_SPEC,
  BULLDOZER_TRANSFORMING,
  BULLDOZER_WIDE_BLADE,
} from "./spec";
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
  // A step found on the same tick keeps its higher jump (ADR 0138).
  return {
    ...result,
    jumpVelocity: Math.max(result.jumpVelocity, BULLDOZER_SPEC.hopVelocity),
    state: { ...result.state, stepTicks: BULLDOZER_SPEC.hopTicks - 1 },
  };
}

export function cutReach(form: Form, onGround: boolean): CutReach | undefined {
  if (form !== "car") return { kind: "fixed", grounded: onGround };
  return onGround ? { kind: "run" } : undefined;
}

export class BulldozerDrive extends TransformingDrive {
  private travel: TrackTravel = { r: 0, l: 0 };
  private doorTimer = 0;
  private doorSteps = 0;
  /** The blade's target: the saved property or the spawn default, then whatever setEquipmentState last set. The shown height travels toward it (ADR 0138). */
  private bladeTargetRaised: boolean;
  /** 0 (down) to BULLDOZER_SPEC.bladeLiftTicks (up), one step per tick. */
  private bladeSteps: number;
  private wideBlade: boolean;
  /** Whether the road paver switch is on; while on and driven, step paves (ADR 0181). */
  private roadPaverOn: boolean;
  private readonly bodySync = new SyncedCommands<BulldozerDrive>()
    .add((drive) => drive.doorSteps / BULLDOZER_SPEC.doorSteps, doorCommand)
    .add(
      (drive) => drive.bladeSteps / BULLDOZER_SPEC.bladeLiftTicks,
      bladeCommand,
    )
    .add((drive) => drive.wideBlade, wideBladeCommand)
    .add((drive) => drive.roadPaverOn, roadPaverCommand);
  private readonly equipment = equipmentBindings(BULLDOZER_EQUIPMENT, {
    [BLADE_SWITCH_ITEM]: {
      // The monitor shows the target before the blade finishes easing (ADR 0139).
      get: () => (this.bladeTargetRaised ? "up" : "down"),
      set: (state) => {
        this.bladeTargetRaised = state === "up";
      },
    },
    [ROAD_PAVER_SWITCH_ITEM]: {
      get: () => (this.roadPaverOn ? "on" : "off"),
      set: (state) => {
        this.roadPaverOn = state === "on";
      },
    },
    [WIDE_BLADE_SWITCH_ITEM]: {
      get: () => (this.wideBlade ? "wide" : "normal"),
      set: (state) => {
        this.wideBlade = state === "wide";
      },
    },
  });

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
      },
    );
    const saved = restored.blade;
    this.bladeTargetRaised =
      typeof saved === "number"
        ? saved >= 0.5
        : BULLDOZER_SPEC.bladeRaisedOnSpawn;
    this.bladeSteps = this.bladeTargetSteps();
    this.wideBlade = restored.wide_blade === true;
    this.roadPaverOn = restored.road_paver === true;
    const { phaseStep, radius } = BULLDOZER_SPEC.tracks;
    for (const side of TRACK_SIDES) {
      this.bodySync.add(
        (drive) => trackPhase(drive.travel[side], phaseStep),
        (phase) => trackPhaseCommand(side, phase),
      );
    }
    for (const side of TRACK_SIDES) {
      this.bodySync.add(
        (drive) => trackSpin(drive.travel[side], radius),
        (spin) => trackSpinCommand(side, spin),
      );
    }
    // Unlike the other kinds, a rebuilt bulldozer resends gravity and its restored
    // form on the first step instead of trusting ADR 0127's primed form (ADR 0136).
    this.resync();
  }

  equipmentState(item: string): string | undefined {
    return this.equipment.equipmentState(item);
  }

  setEquipmentState(item: string, state: string): boolean {
    return this.equipment.setEquipmentState(item, state);
  }

  private bladeTargetSteps(): number {
    return this.bladeTargetRaised ? BULLDOZER_SPEC.bladeLiftTicks : 0;
  }

  // Step-up follows the blade each tick: raised climbs like the SUV, lowered keeps ADR 0136's flat drive (ADR 0138).
  protected override stepUpEnabled(): boolean {
    return this.bladeTargetRaised;
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
    this.bodySync.resync();
  }

  override step(raw: RawInput | undefined, ctx: TickContext): DriveStep {
    const yawBefore = this.yaw;
    const out = super.step(raw, ctx);
    this.bladeSteps += Math.sign(this.bladeTargetSteps() - this.bladeSteps);
    const cut = this.bladeCut(raw, ctx);
    const pave =
      this.roadPaverOn && raw !== undefined ? this.lay(ctx) : undefined;
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
    const commands = [...out.commands, ...this.bodySync.next(this)];
    return {
      ...out,
      ramHalfWidth: this.bladeRule().halfWidth,
      ...(cut === undefined ? {} : { cut }),
      ...(pave === undefined ? {} : { pave }),
      commands,
    };
  }

  private bladeCut(
    raw: RawInput | undefined,
    ctx: TickContext,
  ): CutColumn[] | undefined {
    if (raw === undefined || this.bladeTargetRaised || this.bladeSteps !== 0)
      return undefined;
    const cut = [...this.forwardCut(ctx), ...this.shaftCut(raw, ctx)];
    return cut.length === 0 ? undefined : cut;
  }

  private lay(ctx: TickContext): Pave | undefined {
    return paveStep(
      {
        location: ctx.location,
        yaw: this.yaw,
        speed: this.speed,
        form: this.form,
        onGround: ctx.onGround,
        halfWidth: this.bladeRule().halfWidth,
        block: ctx.heldBlock,
      },
      (cell) => this.classAt(ctx, cell),
    );
  }

  /** Solid first: waterAt is also true for waterlogged blocks. */
  private classAt(ctx: TickContext, cell: Vec3): CellClass {
    const offset = offsetToCellCenter(ctx.location, cellOf(cell));
    if (ctx.solidAt(offset)) return "solid";
    if (ctx.waterAt(offset) || ctx.lavaAt?.(offset)) return "liquid";
    return "open";
  }

  private bladeRule(): BladeRule {
    return this.wideBlade ? BULLDOZER_WIDE_BLADE : BULLDOZER_SPEC.blade;
  }

  private forwardCut(ctx: TickContext): CutColumn[] {
    const rule = this.bladeRule();
    const reach = cutReach(this.form, ctx.onGround);
    if (
      this.readings.input.steer === 0 &&
      this.speed > rule.minSpeed &&
      reach !== undefined
    )
      return bladeColumns(ctx.location, this.yaw, rule, reach);
    return [];
  }

  /** While rising with something solid over the footprint, the wide hole above the body (ADR 0155). */
  private shaftCut(raw: RawInput, ctx: TickContext): CutColumn[] {
    const rising =
      this.form === "takeoff" ||
      ((this.form === "hover" || this.form === "submarine") &&
        climbInput(raw) > 0);
    if (!rising) return [];
    const { margin, reach } = BULLDOZER_SPEC.shaft;
    const half = BULLDOZER_SPEC.footprint / 2;
    const shaft = (halfExtent: number) =>
      shaftColumns(ctx.location, {
        halfExtent,
        bodyHeight: BULLDOZER_SPEC.carHeight,
        reach,
      });
    return shaft(half).some((c) => this.solidOverhead(ctx, c))
      ? shaft(half + margin)
      : [];
  }

  private solidOverhead(ctx: TickContext, c: CutColumn): boolean {
    for (let dy = 0; dy < (c.height ?? 0); dy++)
      if (
        ctx.solidAt(
          offsetToCellCenter(
            ctx.location,
            cellOf({
              x: c.x,
              y: c.bottom + dy,
              z: c.z,
            }),
          ),
        )
      )
        return true;
    return false;
  }
}
