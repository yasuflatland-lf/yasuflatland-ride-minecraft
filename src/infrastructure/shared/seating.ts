import type { Dimension, Entity, Player } from "@minecraft/server";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { type Cell, cellCenter, cellOf } from "../../domain/shared/cells";
import { seatWorldPoint } from "../../domain/shared/frame";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../domain/shared/ids";
import { isStandable, type StandPolicy } from "../../domain/shared/standing";
import type { Vec3 } from "../../domain/shared/vec";
import { sampleBlock } from "./blocks";

import { NAMESPACE } from "./identifiers";
import { playerById } from "./players";

export function seatRider(entity: Entity, player: Player, seat: Vec3): boolean {
  if (
    !entity.isValid ||
    !player.isValid ||
    player.getComponent("minecraft:riding") ||
    player.dimension.id !== entity.dimension.id
  )
    return false;
  const yaw = entity.getRotation().y;
  const point = seatWorldPoint(entity.location, yaw, seat);
  // addRider requires a nearby player in the entity's dimension.
  player.teleport(point, { dimension: entity.dimension });
  return entity.getComponent("minecraft:rideable")?.addRider(player) === true;
}

const SEAT_STAND_POLICY: StandPolicy = {
  allowPassableBody: false,
  hazards: new Set(),
  rejectDecorationFloor: true,
  requireSolidFloor: false,
};

interface StandSpaces {
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
}

export function makeSafeStand(
  dimension: Dimension,
  deps: StandSpaces,
): (c: Cell) => boolean {
  const dimensionId = asDimensionId(dimension.id);
  const sampleOptions = { probeSolidity: false };
  return (feetCell) => {
    const headCell = cellOf({ ...feetCell, y: feetCell.y + 1 });
    const floor = sampleBlock(
      dimension,
      cellOf({ ...feetCell, y: feetCell.y - 1 }),
      sampleOptions,
    );
    const feet = sampleBlock(dimension, feetCell, sampleOptions);
    const head = sampleBlock(dimension, headCell, sampleOptions);
    return (
      isStandable(feet, head, floor, SEAT_STAND_POLICY) &&
      [feetCell, headCell].every(
        (at) =>
          !deps.isVehicleSpace(dimensionId, at) &&
          !deps.isCampSpace(dimensionId, at),
      )
    );
  };
}

export function playerRiderOf(
  entity: Entity | undefined,
): PlayerId | undefined {
  const rider = entity
    ?.getComponent("minecraft:rideable")
    ?.getRiders()
    .find((rider) => rider.typeId === "minecraft:player");
  return rider && asPlayerId(rider.id);
}

export function seatPlayer(
  entity: Entity | undefined,
  playerId: PlayerId,
  seat: Vec3 | undefined,
  label: string,
): boolean {
  if (!entity || !seat) return false;
  const player = playerById(playerId);
  if (!player) return false;
  try {
    return seatRider(entity, player, seat);
  } catch (error) {
    console.warn(`[${NAMESPACE}] ${label} seating failed: ${error}`);
    return false;
  }
}

export function standBeside(
  playerId: PlayerId,
  entity: Entity,
  findExit: (isSafe: (cell: Cell) => boolean) => Cell | undefined,
  deps: StandSpaces,
): void {
  const player = playerById(playerId);
  // A delayed dismount must not pull the player back from another dimension or ride.
  if (
    !player?.isValid ||
    player.dimension.id !== entity.dimension.id ||
    player.getComponent("minecraft:riding")
  )
    return;
  const dimension = entity.dimension;
  const exit = findExit(makeSafeStand(dimension, deps));
  if (exit) player.teleport(cellCenter(exit), { dimension });
}

export function ejectTo(
  player: Entity,
  cell: Cell,
  dimension: Dimension,
): void {
  player
    .getComponent("minecraft:riding")
    ?.entityRidingOn?.getComponent("minecraft:rideable")
    ?.ejectRider(player);
  player.teleport(cellCenter(cell), { dimension });
}
