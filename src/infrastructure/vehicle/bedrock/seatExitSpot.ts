import type { Block, Dimension } from "@minecraft/server";
import { CLEARABLE_DECORATIONS } from "../../../domain/shared/decorations";
import type { Vec3 } from "../../../domain/shared/vec";
import { isLightBlock } from "../../shared/lightBlocks";

// A player's box is 0.6 wide; the margin keeps a box that only touches a cell
// boundary from counting the next column (ADR 0141).
const HALF_WIDTH = 0.299;

// A snow layer of height state 3 (four layers) reaches half a block, the most the
// engine steps a player up out of (ADR 0141).
const MAX_SNOW_HEIGHT = 3;

// Tracks on a block lower than a full one (a dirt path, farmland, mud, soul sand or a
// bottom slab) stand inside its row at least half a block up (ADR 0136), so the
// exit's floor-height cell beside them is that ground block, not the space above it.
const RAISED_FLOOR = 0.5;

function passable(block: Block): boolean {
  if (block.isAir || isLightBlock(block)) return true;
  if (block.typeId === "minecraft:snow_layer")
    return Number(block.permutation.getState("height")) <= MAX_SNOW_HEIGHT;
  // It hurts and slows whoever stands in it.
  if (block.typeId === "minecraft:sweet_berry_bush") return false;
  return (
    CLEARABLE_DECORATIONS.has(block.typeId) || block.typeId.endsWith("_carpet")
  );
}

function ground(block: Block): boolean {
  return !block.isLiquid && !passable(block);
}

function blockAt(dimension: Dimension, at: Vec3): Block | undefined {
  try {
    return dimension.getBlock(at);
  } catch {
    return undefined; // Unloaded chunk or outside the world
  }
}

function columns(at: Vec3): { x: number; z: number }[] {
  const xs = new Set([
    Math.floor(at.x - HALF_WIDTH),
    Math.floor(at.x + HALF_WIDTH),
  ]);
  const zs = new Set([
    Math.floor(at.z - HALF_WIDTH),
    Math.floor(at.z + HALF_WIDTH),
  ]);
  return [...xs].flatMap((x) => [...zs].map((z) => ({ x, z })));
}

function bodyOpen(dimension: Dimension, at: Vec3, feet: number): boolean {
  return columns(at).every(({ x, z }) =>
    [feet, feet + 1].every((y) => {
      const block = blockAt(dimension, { x, y, z });
      return block !== undefined && passable(block);
    }),
  );
}

/**
 * Where a rider getting out at `at` (a seat exit at the vehicle's feet height) can
 * stand, or undefined to keep the engine's spot (ADR 0141). Every cell the player's
 * box overlaps in the feet and head rows must be air, a light block, ground cover a
 * player walks through or a low snow layer, and the cell under the middle of the feet
 * must be ground, not air, cover or a liquid. On ground lower than a full block, the
 * rows above that ground are checked and the player stands on its top.
 */
export function seatExitSpot(dimension: Dimension, at: Vec3): Vec3 | undefined {
  const row = Math.floor(at.y);
  const cell = { x: Math.floor(at.x), z: Math.floor(at.z) };
  const below = blockAt(dimension, { ...cell, y: row - 1 });
  if (below && ground(below) && bodyOpen(dimension, at, row)) return at;
  const floor = blockAt(dimension, { ...cell, y: row });
  if (
    at.y - row >= RAISED_FLOOR &&
    floor &&
    ground(floor) &&
    bodyOpen(dimension, at, row + 1)
  )
    return { ...at, y: row + 1 };
  return undefined;
}
