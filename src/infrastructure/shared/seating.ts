import type { Dimension, Entity, Player } from "@minecraft/server";
import type { Cell } from "../../domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../domain/shared/decorations";
import { forward, rightOf } from "../../domain/shared/vec";
import { safeBlockAt } from "./blocks";

export function seatRider(
  entity: Entity,
  player: Player,
  seat: { x: number; y: number; z: number },
): boolean {
  if (
    !entity.isValid ||
    !player.isValid ||
    player.getComponent("minecraft:riding") ||
    player.dimension.id !== entity.dimension.id
  )
    return false;
  const facing = forward(entity.getRotation().y);
  const right = rightOf(facing);
  // addRider requires a nearby player in the entity's dimension.
  player.teleport(
    {
      x: entity.location.x + right.x * seat.x - facing.x * seat.z,
      y: entity.location.y + seat.y,
      z: entity.location.z + right.z * seat.x - facing.z * seat.z,
    },
    { dimension: entity.dimension },
  );
  return entity.getComponent("minecraft:rideable")?.addRider(player) === true;
}

export function makeSafeStand(deps: {
  isVehicleSpace(c: Cell): boolean;
  isCampSpace(c: Cell): boolean;
}): (dimension: Dimension, c: Cell) => boolean {
  return (dimension, cell) => {
    const floor = safeBlockAt(dimension, { ...cell, y: cell.y - 1 });
    return (
      floor !== undefined &&
      !floor.isAir &&
      !floor.isLiquid &&
      !CLEARABLE_DECORATIONS.has(floor.typeId) &&
      [cell, { ...cell, y: cell.y + 1 }].every(
        (at) =>
          safeBlockAt(dimension, at)?.isAir === true &&
          !deps.isVehicleSpace(at) &&
          !deps.isCampSpace(at),
      )
    );
  };
}
