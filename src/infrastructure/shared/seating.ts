import type { Dimension, Entity, Player } from "@minecraft/server";
import type { Cell } from "../../domain/shared/cells";
import { isStandable, type StandPolicy } from "../../domain/shared/standing";
import { forward, rightOf } from "../../domain/shared/vec";
import { sampleBlock } from "./blocks";

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

const SEAT_STAND_POLICY: StandPolicy = {
  allowPassableBody: false,
  hazards: new Set(),
  rejectDecorationFloor: true,
  requireSolidFloor: false,
};

export function makeSafeStand(deps: {
  isVehicleSpace(c: Cell): boolean;
  isCampSpace(c: Cell): boolean;
}): (dimension: Dimension, c: Cell) => boolean {
  const sampleOptions = { probeSolidity: false };
  return (dimension, feetCell) => {
    const headCell = { ...feetCell, y: feetCell.y + 1 };
    const floor = sampleBlock(
      dimension,
      { ...feetCell, y: feetCell.y - 1 },
      sampleOptions,
    );
    const feet = sampleBlock(dimension, feetCell, sampleOptions);
    const head = sampleBlock(dimension, headCell, sampleOptions);
    return (
      isStandable(feet, head, floor, SEAT_STAND_POLICY) &&
      [feetCell, headCell].every(
        (at) => !deps.isVehicleSpace(at) && !deps.isCampSpace(at),
      )
    );
  };
}
