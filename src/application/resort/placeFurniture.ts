import {
  FURNITURE_SPEC,
  type FurnitureKind,
  furnitureCells,
  furnitureClearCells,
  furniturePose,
  furnitureSupportCells,
  overlapsAny,
  RESORT_GEAR_QUERY_RADIUS,
} from "../../domain/resort/furniture";
import type { Cell } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { canUseBlockTop, placeOnCells } from "../shared/groundPlacement";
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
    const world = this.world;
    const { player, dimension, block, face, yaw, slot, kind } = cmd;
    const blocked = () => {
      world.showBlocked(player);
      return false;
    };
    if (!canUseBlockTop(world, dimension, block, face)) return blocked();
    const pose = furniturePose(block, yaw, kind);
    const payment = {
      isCreative: (p: PlayerId) => world.isCreative(p),
      consumeItem: (p: PlayerId, s: number) => world.consumeItem(p, kind, s),
      refund: (p: PlayerId, s: number) => world.refund(p, kind, s),
    };
    const result = placeOnCells(
      { dimension, cells: world, payment },
      {
        support: furnitureSupportCells(pose),
        clear: furnitureClearCells(pose),
        refuses: FURNITURE_SPEC[kind].refuses,
        extraCheck: () => {
          const occupied = world.resortGearCells(
            dimension,
            pose.origin,
            RESORT_GEAR_QUERY_RADIUS,
          );
          return !overlapsAny(furnitureCells(pose), occupied);
        },
      },
      { player, slot },
      () => world.spawn(dimension, pose),
      FURNITURE_SPEC[kind].top ? (id) => world.layTop(id) : undefined,
    );
    return result.placed || blocked();
  }
}
