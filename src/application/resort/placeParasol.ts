import {
  parasolFootCells,
  parasolPose,
  parasolSupportCell,
  tooCloseToOtherBase,
} from "../../domain/resort/parasolPose";
import { PARASOL_SPEC } from "../../domain/resort/spec";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop, placeOnCells } from "../shared/groundPlacement";
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
    const world = this.world;
    const { player, dimension, block, face, yaw, slot } = cmd;
    const blocked = () => {
      world.showBlocked(player);
      return false;
    };
    if (!canUseBlockTop(world, dimension, block, face)) return blocked();
    const pose = parasolPose(block, yaw);
    const result = placeOnCells(
      { dimension, cells: world, payment: world },
      {
        support: [parasolSupportCell(pose)],
        clear: parasolFootCells(pose),
        protect: ["vehicle", "camp"],
        extraCheck: () =>
          !tooCloseToOtherBase(
            pose.base,
            world.baseCellsNear(
              dimension,
              pose.base,
              PARASOL_SPEC.minBaseDistance,
            ),
          ),
      },
      { player, slot },
      () => world.spawn(dimension, pose),
      (id) => world.layCeiling(id),
    );
    return result.placed || blocked();
  }
}
