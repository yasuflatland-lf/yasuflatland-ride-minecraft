import {
  FURNITURE_SPEC,
  type FurnitureKind,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
} from "../../domain/resort/furniture";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop } from "../shared/groundPlacement";
import { placePaid } from "../shared/paidPlacement";
import type { FurnitureWorld } from "./ports/furnitureWorld";

export class PlaceFurniture {
  constructor(private readonly world: FurnitureWorld) {}
  execute(cmd: {
    player: PlayerId;
    dimension: DimensionId;
    block: Cell;
    face: string;
    yaw: number;
    slot: number;
    kind: FurnitureKind;
  }): boolean {
    const { player, dimension, block, face, yaw, slot, kind } = cmd;
    const blocked = () => {
      this.world.showBlocked(player);
      return false;
    };
    if (!canUseBlockTop(this.world, dimension, block, face)) return blocked();
    const pose = furniturePose(block, yaw, kind);
    for (const cell of furnitureSupportCells(pose))
      if (!this.world.isSolidTop(dimension, cell)) return blocked();
    for (const cell of furnitureClearCells(pose)) {
      if (
        !this.world.isAir(dimension, cell) ||
        this.world.isVehicleSpace(dimension, cell) ||
        this.world.isCampSpace(dimension, cell)
      )
        return blocked();
    }
    const result = placePaid(
      {
        isCreative: (p) => this.world.isCreative(p),
        consumeItem: (p, s) => this.world.consumeItem(p, kind, s),
        refund: (p, s) => this.world.refund(p, kind, s),
      },
      { player, slot },
      () => this.world.spawn(dimension, pose),
    );
    if (!result.placed) return blocked();
    if (FURNITURE_SPEC[kind].top) this.world.layTop(result.id);
    return true;
  }
}
