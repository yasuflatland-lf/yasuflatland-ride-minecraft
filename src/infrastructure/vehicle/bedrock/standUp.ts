import type { Dimension, Entity, Player } from "@minecraft/server";
import type { Vec3 } from "../../../domain/shared/vec";
import { isLightBlock } from "../../shared/lightBlocks";
import { isStandableRoomBlock } from "./identifiers";

// The engine drops a dismounting rider next to the entity the rider left, within
// a few blocks. A player who left by /tp, an ender pearl or a portal lands farther
// and is not pulled back (ADR 0109).
const STAND_UP_REACH = 6;

// The feet and head cells must be open, so a block a player put in the aisle
// leaves the engine's dismount spot instead of trapping the rider in it (ADR 0109). An open
// fridge door's plate has no collision, so it leaves the cell open (ADR 0123).
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

/**
 * Moves `player`, who rides nothing, to `at`, keeping their view (ADR 0109). A player
 * who rides something, is no longer valid, is dead, is in another dimension than
 * `from`, or is more than STAND_UP_REACH blocks from `from` is left where the engine
 * put them, and so is one whose feet or head cell at `at` is not open. Returns whether
 * the player was moved.
 */
export function standUp(player: Player, from: Entity, at: Vec3): boolean {
  if (
    !player.isValid ||
    player.dimension.id !== from.dimension.id ||
    player.getComponent("minecraft:riding") ||
    (player.getComponent("minecraft:health")?.currentValue ?? 1) <= 0 ||
    Math.hypot(
      player.location.x - from.location.x,
      player.location.y - from.location.y,
      player.location.z - from.location.z,
    ) > STAND_UP_REACH ||
    !standClear(from.dimension, at)
  )
    return false;
  player.teleport(at, { rotation: player.getRotation() });
  return true;
}
