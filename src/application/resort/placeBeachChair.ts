import {
  beachChairClearCells,
  beachChairPose,
  beachChairSupportCells,
} from "../../domain/resort/beachChair";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop } from "../shared/groundPlacement";
import type { BeachChairWorld } from "./ports/beachChairWorld";

export class PlaceBeachChair {
  constructor(private readonly world: BeachChairWorld) {}
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
    const pose = beachChairPose(block, yaw);
    for (const cell of beachChairSupportCells(pose))
      if (!this.world.isSolidTop(dimension, cell)) return blocked();
    for (const cell of beachChairClearCells(pose)) {
      if (
        !this.world.isAir(dimension, cell) ||
        this.world.isVehicleSpace(dimension, cell) ||
        this.world.isCampSpace(dimension, cell)
      )
        return blocked();
    }
    const paid = !this.world.isCreative(player);
    if (paid && !this.world.consumeItem(player, slot)) return blocked();
    const id = this.world.spawn(dimension, pose);
    if (id === undefined) {
      if (paid) this.world.refund(player, slot);
      return blocked();
    }
    return true;
  }
}
