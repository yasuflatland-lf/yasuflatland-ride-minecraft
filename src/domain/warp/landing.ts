import type { Cell } from "../shared/cells";
import type { StandPolicy } from "../shared/standing";
import { add3 } from "../shared/vec";
import { WARP_SPEC } from "./spec";

function landingOffsets(): readonly Cell[] {
  const { landingRadius, landingRises } = WARP_SPEC;
  const offsets: Cell[] = [];
  for (let x = -landingRadius; x <= landingRadius; x++) {
    for (let z = -landingRadius; z <= landingRadius; z++) {
      for (const y of landingRises) {
        if (x !== 0 || z !== 0 || y !== 0) offsets.push({ x, y, z });
      }
    }
  }
  const distanceSquared = ({ x, y, z }: Cell) => x * x + y * y + z * z;
  const ownColumn = ({ x, z }: Cell) => Number(x === 0 && z === 0);
  return offsets.sort(
    (a, b) =>
      distanceSquared(a) - distanceSquared(b) ||
      ownColumn(b) - ownColumn(a) ||
      a.y - b.y ||
      a.x - b.x ||
      a.z - b.z,
  );
}

const LANDING_OFFSETS = landingOffsets();

export function landingCandidates(cell: Cell): readonly Cell[] {
  return LANDING_OFFSETS.map((offset) => add3(cell, offset));
}

export function chooseLanding(
  cell: Cell,
  isStandable: (feet: Cell) => boolean,
): Cell {
  return (
    landingCandidates(cell).find((feet) => isStandable(feet)) ?? {
      ...cell,
      y: cell.y + 1,
    }
  );
}

export const WARP_LANDING_POLICY: StandPolicy = {
  allowPassableBody: true,
  hazards: new Set([
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:cactus",
    "minecraft:magma",
  ]),
  rejectDecorationFloor: false,
  requireSolidFloor: true,
};
