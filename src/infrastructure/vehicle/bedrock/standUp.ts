import type { Dimension, Entity, Player } from "@minecraft/server";
import type { Vec3 } from "../../../domain/shared/vec";
import { isLightBlock } from "../../shared/lightBlocks";
import { isStandableRoomBlock } from "./identifiers";

// The engine drops a dismounting rider next to the box of the entity the rider
// left, outside the camper wall or on its roof at worst, so within a few blocks of
// it. A player who left by /tp, an ender pearl or a portal lands farther and is not
// pulled back (ADR 0109).
const STAND_UP_REACH = 6;

// The feet and head cells at the point must be open, so a block placed there (such
// as one a player put in a camper aisle) leaves the rider at the engine's dismount
// spot instead of trapping them in it (ADR 0109). An open fridge door's plate has no
// collision, so it leaves the cell open (ADR 0123).
function standClear(dimension: Dimension, at: Vec3): boolean {
  const feet = { x: at.x, y: Math.floor(at.y), z: at.z };
  return [feet, { ...feet, y: feet.y + 1 }].every((cell) => {
    try {
      const block = dimension.getBlock(cell);
      return (
        block !== undefined &&
        (block.isAir ||
          isLightBlock(block) ||
          isStandableRoomBlock(block.typeId))
      );
    } catch {
      return false; // Unloaded chunk or outside the world
    }
  });
}

const openCellSpot = (dimension: Dimension, at: Vec3): Vec3 | undefined =>
  standClear(dimension, at) ? at : undefined;

/**
 * Moves `player` to the spot `place` finds for `at`, keeping their view (ADR 0109).
 * It leaves the player where the engine put them if they ride something again (they
 * boarded the vehicle or another seat), are no longer valid or are dead, are in
 * another dimension than `from` or more than STAND_UP_REACH blocks from it, or if
 * `place` finds no spot. The default `place` keeps `at` when its feet and head cells
 * are open. Returns whether the player was moved.
 */
export function standUp(
  player: Player,
  from: Entity,
  at: Vec3,
  place: (dimension: Dimension, at: Vec3) => Vec3 | undefined = openCellSpot,
): boolean {
  if (
    !player.isValid ||
    player.dimension.id !== from.dimension.id ||
    player.getComponent("minecraft:riding") ||
    (player.getComponent("minecraft:health")?.currentValue ?? 1) <= 0 ||
    Math.hypot(
      player.location.x - from.location.x,
      player.location.y - from.location.y,
      player.location.z - from.location.z,
    ) > STAND_UP_REACH
  )
    return false;
  const spot = place(from.dimension, at);
  if (!spot) return false;
  player.teleport(spot, { rotation: player.getRotation() });
  return true;
}
