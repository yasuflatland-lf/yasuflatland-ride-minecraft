import type { Cell } from "../shared/cells";

export function landingCandidates(cell: Cell): readonly Cell[] {
  const sides = [
    { x: cell.x + 1, y: cell.y, z: cell.z },
    { x: cell.x - 1, y: cell.y, z: cell.z },
    { x: cell.x, y: cell.y, z: cell.z + 1 },
    { x: cell.x, y: cell.y, z: cell.z - 1 },
  ];
  return [
    { ...cell, y: cell.y + 1 },
    ...sides,
    ...sides.map((side) => ({ ...side, y: side.y + 1 })),
  ];
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

export interface LandingSample {
  readonly typeId: string;
  readonly isAir: boolean;
  readonly isLiquid: boolean;
  readonly solid: boolean;
}

const LANDING_HAZARDS = new Set([
  "minecraft:lava",
  "minecraft:flowing_lava",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:cactus",
  "minecraft:magma",
]);

export function isStandableLanding(
  floor: LandingSample,
  body: LandingSample,
  head: LandingSample,
): boolean {
  return (
    ![floor, body, head].some((block) => LANDING_HAZARDS.has(block.typeId)) &&
    floor.solid &&
    !floor.isAir &&
    !floor.isLiquid &&
    [body, head].every(
      (block) => block.isAir || (!block.isLiquid && !block.solid),
    )
  );
}
