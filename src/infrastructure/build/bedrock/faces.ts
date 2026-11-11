import { Direction } from "@minecraft/server";
import type { Face } from "../../../domain/build/aim/face";

export const FACES: Record<Direction, Face> = {
  [Direction.Up]: "up",
  [Direction.Down]: "down",
  [Direction.North]: "north",
  [Direction.South]: "south",
  [Direction.East]: "east",
  [Direction.West]: "west",
};
