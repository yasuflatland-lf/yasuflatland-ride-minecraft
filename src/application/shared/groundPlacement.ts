import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { GroundCellsWorld } from "./ports/groundCells";

/** Accept only block tops outside the add-on's laid blocks. */
export function canUseBlockTop(
  world: GroundCellsWorld,
  dimension: DimensionId,
  block: Vec3,
  face: string,
): boolean {
  return face === "up" && !world.isOwnBlock(dimension, block);
}

/** Keep the item's clearance column free of blocks and vehicle space. */
export function hasClearance(
  world: GroundCellsWorld,
  dimension: DimensionId,
  base: Vec3,
  clearance: number,
): boolean {
  for (let dy = 0; dy < clearance; dy++) {
    const cell = { ...base, y: base.y + dy };
    if (!world.isAir(dimension, cell) || world.isVehicleSpace(dimension, cell))
      return false;
  }
  return true;
}

/** Check clearance and spacing before payment, then spawn with the item's yaw snap. */
export function placeOnGround(
  world: GroundCellsWorld,
  spec: { clearance: number; yawStep: number },
  cmd: {
    player: PlayerId;
    dimension: DimensionId;
    block: Vec3;
    yaw: number;
    slot: number;
  },
  item: {
    isNear(dimension: DimensionId, at: Vec3): boolean;
    spawn(dimension: DimensionId, at: Vec3, yaw: number): void;
  },
): boolean {
  const { player, dimension, block, yaw, slot } = cmd;
  if (
    !hasClearance(
      world,
      dimension,
      { ...block, y: block.y + 1 },
      spec.clearance,
    )
  )
    return false;
  const at = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
  if (item.isNear(dimension, at)) return false;
  if (!world.isCreative(player) && !world.consumeItem(player, slot))
    return false;
  item.spawn(dimension, at, Math.round(yaw / spec.yawStep) * spec.yawStep);
  return true;
}
