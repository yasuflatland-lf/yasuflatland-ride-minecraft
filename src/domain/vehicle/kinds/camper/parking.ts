import type { Vec3 } from "../../../shared/vec";
import type { ClearCell } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import type { EngineCommand, TickContext } from "../../drive";
import type { Hold } from "../../motion/dock";
import { readBlockGroups } from "./blockGroups";
import { slotCells } from "./decorCells";
import { STORAGE_DOORS } from "./furniture";
import {
  isPassable,
  parkCheckCells,
  parkGround,
  planPark,
  wallFootCells,
} from "./groundCheck";
import { exitCells } from "./roomCells";
import { AIR } from "./roomGeometry";
import { cargoCells, holdsCargo, storagePlateChecks } from "./storagePlates";

function obstruction(
  ctx: TickContext,
  cell: Vec3,
  typeId: string | undefined,
): string | undefined {
  return typeId !== undefined &&
    typeId !== AIR &&
    ctx.ownsLaidBlock?.(cell, typeId)
    ? AIR
    : typeId;
}

export class CamperParking {
  // A newly parked body still collides until the dock event takes effect (ADR 0068).
  private roomLaid = false;
  private pendingClear: readonly ClearCell[] = [];
  private parkTried = false;
  private stickWasPushed = false;

  constructor(
    private readonly hold: Hold,
    private readonly restoredLaid: boolean,
  ) {}

  /** Returns whether the drive must lay the recovered room before handling input. */
  recover(pose: HoldPose, ctx: TickContext): boolean {
    const clear = this.restoredLaid ? [] : this.clearFor(pose, ctx);
    if (clear === undefined) return false;
    this.hold.adopt(pose);
    this.pendingClear = clear;
    // A docked entity already has no collision, so recovery may clear and lay together.
    this.roomLaid = true;
    return !this.restoredLaid;
  }

  clearFor(pose: HoldPose, ctx: TickContext): ClearCell[] | undefined {
    const cells = parkCheckCells(pose);
    const feet = wallFootCells(pose);
    const blocks = readBlockGroups(ctx, { cells, feet });
    const types = cells.map((cell, i) =>
      obstruction(ctx, cell, blocks.cells[i]),
    );
    return planPark(cells, types, feet, blocks.feet, parkGround(pose));
  }

  park(pose: HoldPose, clear: readonly ClearCell[]): EngineCommand[] {
    this.pendingClear = clear;
    this.roomLaid = false;
    this.parkTried = false;
    return this.hold.enter(pose);
  }

  takeLaying(): {
    readonly lay: boolean;
    readonly clear: readonly ClearCell[];
  } {
    const lay = this.roomLaid;
    const clear = lay ? this.pendingClear : [];
    if (lay) this.pendingClear = [];
    this.roomLaid = true;
    return { lay, clear };
  }

  observe(still: boolean): boolean {
    if (!still) this.parkTried = false;
    if (!this.hold.observe(still) || this.parkTried) return false;
    this.parkTried = true;
    return true;
  }

  pressedStick(pushed: boolean): boolean {
    const pressed = pushed && !this.stickWasPushed;
    this.stickWasPushed = pushed;
    return pressed;
  }

  departureCheck(
    pose: HoldPose,
    ctx: TickContext,
  ): { readonly blocked: boolean; readonly exitClear: boolean } {
    const room = [
      ...slotCells(pose),
      ...storagePlateChecks(pose, STORAGE_DOORS).map(({ cell }) => cell),
    ];
    // The same departure batch checks cargo, the room's own blocks, and the overflow exit
    // (ADR 0093, 0097, 0105, 0121).
    const blocks = readBlockGroups(ctx, {
      cargo: cargoCells(pose),
      room,
      exits: exitCells(pose),
    });
    return {
      blocked:
        holdsCargo(blocks.cargo) ||
        room.some((cell, i) => obstruction(ctx, cell, blocks.room[i]) !== AIR),
      exitClear: blocks.exits.every(isPassable),
    };
  }

  leave(): EngineCommand[] {
    this.pendingClear = [];
    return this.hold.leave();
  }
}
