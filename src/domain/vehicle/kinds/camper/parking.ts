import type { DecorPlacement } from "../../dock/decor";
import type { ClearCell } from "../../dock/dock";
import type { HoldPose } from "../../dock/floor";
import type { EngineCommand, TickContext } from "../../drive";
import type { Hold } from "../../motion/dock";
import { readBlockGroups } from "./blockGroups";
import { DECOR_CELLS } from "./decor";
import { decorBlockName, ownSlotBlock, slotCells } from "./decorCells";
import { STORAGE_DOORS } from "./furniture";
import {
  isPassable,
  parkCheckCells,
  parkGround,
  planPark,
  wallFootCells,
} from "./groundCheck";
import { exitCells } from "./roomCells";
import {
  cargoCells,
  holdsCargo,
  ownPlateBlock,
  storagePlateChecks,
} from "./storagePlates";

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
    return planPark(cells, blocks.cells, feet, blocks.feet, parkGround(pose));
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
    decor: readonly DecorPlacement[],
  ): { readonly blocked: boolean; readonly exitClear: boolean } {
    const plates = storagePlateChecks(pose, STORAGE_DOORS);
    // The same departure batch checks cargo, the room's own blocks, and the overflow exit
    // (ADR 0093, 0097, 0105, 0121).
    const blocks = readBlockGroups(ctx, {
      cargo: cargoCells(pose),
      slots: slotCells(pose),
      plates: plates.map(({ cell }) => cell),
      exits: exitCells(pose),
    });
    return {
      blocked:
        holdsCargo(blocks.cargo) ||
        DECOR_CELLS.some(
          ({ cell }, i) =>
            !ownSlotBlock(blocks.slots[i], decorBlockName(cell, decor)),
        ) ||
        plates.some(({ door }, i) => !ownPlateBlock(blocks.plates[i], door)),
      exitClear: blocks.exits.every(isPassable),
    };
  }

  leave(): EngineCommand[] {
    this.pendingClear = [];
    return this.hold.leave();
  }
}
