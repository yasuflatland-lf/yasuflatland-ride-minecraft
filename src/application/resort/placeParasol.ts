import {
  parasolFootCells,
  parasolPose,
  parasolSupportCell,
  tooCloseToOtherBase,
} from "../../domain/resort/parasolPose";
import { PARASOL_SPEC } from "../../domain/resort/spec";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop } from "../shared/groundPlacement";
import type { ParasolWorld } from "./ports/parasolWorld";

export class PlaceParasol {
  constructor(private readonly world: ParasolWorld) {}
  execute(cmd: {
    player: PlayerId;
    dimension: DimensionId;
    block: Cell;
    face: string;
    yaw: number;
    slot: number;
  }): boolean {
    const { player, dimension, block, face, yaw, slot } = cmd;
    const blocked = () => {
      this.world.showBlocked(player);
      return false;
    };
    if (!canUseBlockTop(this.world, dimension, block, face)) return blocked();
    const pose = parasolPose(block, yaw);
    if (!this.world.isSolidTop(dimension, parasolSupportCell(pose)))
      return blocked();
    for (const cell of parasolFootCells(pose)) {
      if (
        !this.world.isAir(dimension, cell) ||
        this.world.isVehicleSpace(dimension, cell) ||
        this.world.isCampSpace(dimension, cell)
      )
        return blocked();
    }
    if (
      tooCloseToOtherBase(
        pose.base,
        this.world.baseCellsNear(
          dimension,
          pose.base,
          PARASOL_SPEC.minBaseDistance,
        ),
      )
    )
      return blocked();
    const paid = !this.world.isCreative(player);
    if (paid && !this.world.consumeItem(player, slot)) return blocked();
    const id = this.world.spawn(dimension, pose);
    if (id === undefined) {
      if (paid) this.world.refund(player, slot);
      return blocked();
    }
    this.world.layCeiling(id);
    return true;
  }
}
