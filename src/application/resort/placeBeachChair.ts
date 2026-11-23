import {
  beachChairCells,
  beachChairClearCells,
  beachChairOrigin,
  beachChairPose,
  beachChairSupportCells,
} from "../../domain/resort/beachChair";
import {
  overlapsAny,
  RESORT_GEAR_QUERY_RADIUS,
} from "../../domain/resort/furniture";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop } from "../shared/groundPlacement";
import { placePaid } from "../shared/paidPlacement";
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
    const occupied = this.world.resortGearCells(
      dimension,
      beachChairOrigin(pose),
      RESORT_GEAR_QUERY_RADIUS,
    );
    if (overlapsAny(beachChairCells(pose), occupied)) return blocked();
    const result = placePaid(this.world, { player, slot }, () =>
      this.world.spawn(dimension, pose),
    );
    return result.placed || blocked();
  }
}
