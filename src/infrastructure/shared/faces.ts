import { Direction } from "@minecraft/server";
import type { BlockFace } from "../../domain/shared/blockFace";

const FACES: Record<Direction, BlockFace> = {
  [Direction.Up]: "up",
  [Direction.Down]: "down",
  [Direction.North]: "north",
  [Direction.South]: "south",
  [Direction.East]: "east",
  [Direction.West]: "west",
};

export function blockFaceOf(direction: Direction): BlockFace {
  return FACES[direction];
}
