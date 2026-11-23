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
import { canUseBlockTop, placeOnCells } from "../shared/groundPlacement";
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
    const world = this.world;
    const { player, dimension, block, face, yaw, slot } = cmd;
    const blocked = () => {
      world.showBlocked(player);
      return false;
    };
    if (!canUseBlockTop(world, dimension, block, face)) return blocked();
    const pose = beachChairPose(block, yaw);
    const result = placeOnCells(
      { dimension, cells: world, payment: world },
      {
        support: beachChairSupportCells(pose),
        clear: beachChairClearCells(pose),
        protect: ["vehicle", "camp"],
        extraCheck: () => {
          const occupied = world.resortGearCells(
            dimension,
            beachChairOrigin(pose),
            RESORT_GEAR_QUERY_RADIUS,
          );
          return !overlapsAny(beachChairCells(pose), occupied);
        },
      },
      { player, slot },
      () => world.spawn(dimension, pose),
    );
    return result.placed || blocked();
  }
}
