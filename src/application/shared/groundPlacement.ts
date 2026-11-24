import { type BlockFace, isTopFace } from "../../domain/shared/blockFace";
import {
  type Cell,
  cellCenter,
  type ProtectedSpace,
  VEHICLE_SPACE_ONLY,
} from "../../domain/shared/cells";
import { snapYaw } from "../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { type Payer, placePaid } from "./paidPlacement";
import type { GroundCellsWorld } from "./ports/groundCells";
import type { ItemPayment } from "./ports/itemPayment";

type PlacementCells = Pick<
  GroundCellsWorld,
  "isAir" | "isVehicleSpace" | "isCampSpace"
> & {
  isSolidTop?(dimension: DimensionId, cell: Cell): boolean;
};

type CellPlacement<Id> =
  | { readonly placed: true; readonly id: Id }
  | { readonly placed: false };

export function placeOnCells<Id>(
  world: {
    dimension: DimensionId;
    cells: PlacementCells;
    payment: ItemPayment;
  },
  plan: {
    support: readonly Cell[];
    clear: readonly Cell[];
    refuses: readonly ProtectedSpace[];
    extraCheck?: () => boolean;
  },
  payer: Payer,
  spawn: () => Id | undefined,
  after?: (id: Id) => void,
): CellPlacement<Id> {
  const { dimension, cells, payment } = world;
  if (!plan.support.every((cell) => cells.isSolidTop?.(dimension, cell)))
    return { placed: false };
  if (!areClear(cells, dimension, plan.clear, plan.refuses))
    return { placed: false };
  if (plan.extraCheck?.() === false) return { placed: false };

  const result = placePaid(payment, payer, spawn);
  if (!result.placed) return { placed: false };
  after?.(result.id);
  return result;
}

/** Accept only block tops outside the add-on's laid blocks. */
export function canUseBlockTop(
  world: Pick<GroundCellsWorld, "isOwnBlock">,
  dimension: DimensionId,
  block: Vec3,
  face: BlockFace,
): boolean {
  return isTopFace(face) && !world.isOwnBlock(dimension, block);
}

export function clearanceCells(base: Cell, clearance: number): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < clearance; dy++)
    cells.push({ ...base, y: base.y + dy });
  return cells;
}

function areClear(
  world: PlacementCells,
  dimension: DimensionId,
  cells: readonly Cell[],
  refuses: readonly ProtectedSpace[],
): boolean {
  return cells.every(
    (cell) =>
      world.isAir(dimension, cell) &&
      !isSpaceRefused(world, dimension, cell, refuses),
  );
}

export function isSpaceRefused(
  world: Pick<GroundCellsWorld, "isVehicleSpace" | "isCampSpace">,
  dimension: DimensionId,
  cell: Cell,
  refuses: readonly ProtectedSpace[],
): boolean {
  return (
    (refuses.includes("vehicle") && world.isVehicleSpace(dimension, cell)) ||
    (refuses.includes("camp") && world.isCampSpace?.(dimension, cell) !== false)
  );
}

/** Ovens and lanterns on a host use the camp family's vehicle-only clearance rule. */
export function hasClearance(
  world: GroundCellsWorld,
  dimension: DimensionId,
  base: Vec3,
  clearance: number,
  refuses: readonly ProtectedSpace[] = VEHICLE_SPACE_ONLY,
): boolean {
  return areClear(world, dimension, clearanceCells(base, clearance), refuses);
}

/** Check clearance and spacing before payment, then spawn with the item's yaw snap. */
export function placeOnGround(
  world: GroundCellsWorld & ItemPayment,
  spec: {
    clearance: number;
    yawStep: number;
    refuses: readonly ProtectedSpace[];
  },
  cmd: {
    player?: PlayerId;
    dimension: DimensionId;
    block: Vec3;
    yaw: number;
    slot: number;
  },
  item: {
    isNear(dimension: DimensionId, at: Vec3): boolean;
    spawn(dimension: DimensionId, at: Vec3, yaw: number): string | undefined;
  },
): boolean {
  const { player, dimension, block, yaw, slot } = cmd;
  const at = cellCenter(block, 1);
  return placeOnCells(
    { dimension, cells: world, payment: world },
    {
      support: [],
      clear: clearanceCells({ ...block, y: block.y + 1 }, spec.clearance),
      refuses: spec.refuses,
      extraCheck: () => !item.isNear(dimension, at),
    },
    { player, slot },
    () => item.spawn(dimension, at, snapYaw(yaw, spec.yawStep)),
  ).placed;
}
