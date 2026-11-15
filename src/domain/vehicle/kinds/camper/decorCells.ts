import { cellKey } from "../../../shared/cells";
import type { Vec2, Vec3 } from "../../../shared/vec";
import {
  type DecorItemId,
  type DecorPlacement,
  decorFace,
} from "../../dock/decor";
import type { DockBlock, DockCell, HoldPose } from "../../dock/floor";
import { DECOR_CELLS, DECOR_SLOTS, decorInCell, decorSlot } from "./decor";
import { compartmentDoorAt } from "./dooredStorage";
import {
  DECOR_SPOTS,
  type DecorSlot,
  isStoragePairKind,
  type LocalCell,
  STORAGE_DOORS,
} from "./furniture";
import { axes, cellAt, localCellAt } from "./parkPose";
import { AIR } from "./roomGeometry";

const PX_PER_BLOCK = 16;

// The namespace-free name of yasu_ride:camper_furniture; identifiers.test.ts checks
// it against CAMPER_FURNITURE_BLOCK (ADR 0097).
const FURNITURE_BLOCK_SUFFIX = ":camper_furniture";

// yasu_ride:camper_furniture's height 0 is the hanging box under the hook,
// whatever the hanging slot's own height (ADR 0097, 0102).
const HANGING_FURNITURE_HEIGHT = 0;

/** The world cell of a decor slot at a parked pose (ADR 0093). */
export function decorSlotCell(pose: HoldPose, slot: DecorSlot): Vec3 {
  return localCellAt(pose, slot.cell);
}

/**
 * The world offset in blocks from a cell's middle to the decor spot `spot` (an index in
 * DECOR_SPOTS) at a snapped `yaw`: a decor block's yasu_ride:spot translation (ADR 0107).
 */
export function decorSpotOffset(yaw: number, spot: number): Vec2 {
  const { left, forward } = DECOR_SPOTS[spot] ?? { left: 0, forward: 0 };
  const { f, l } = axes(yaw);
  return {
    x: (left * l.x + forward * f.x) / PX_PER_BLOCK + 0,
    z: (left * l.z + forward * f.z) / PX_PER_BLOCK + 0,
  };
}

type DecorCell = DockCell & {
  readonly block: Extract<DockBlock, { type: "decor" | "decorPair" }>;
};

/** The item at each end of the pair cell that holds `slot`, by DecorPairEnd.end (ADR 0108). */
export function pairItems(
  slot: Pick<DecorSlot, "cell">,
  decor: readonly DecorPlacement[],
  slots: readonly Omit<DecorSlot, "door">[] = DECOR_SLOTS,
): { end0?: DecorItemId; end1?: DecorItemId } {
  const itemAt = (end: 0 | 1) =>
    decor.find((d) => {
      const s = slots.find((s) => s.id === d.slot);
      return (
        s?.pair?.end === end &&
        s.cell.x === slot.cell.x &&
        s.cell.z === slot.cell.z &&
        s.cell.layer === slot.cell.layer
      );
    })?.item;
  const end0 = itemAt(0);
  const end1 = itemAt(1);
  return {
    ...(end0 === undefined ? {} : { end0 }),
    ...(end1 === undefined ? {} : { end1 }),
  };
}

/**
 * One block per slot cell that holds a placement in a known slot, turned to the yaw quarter.
 * On the table it is the pair block with the item at each end (ADR 0108);
 * elsewhere a decor block at the slot's height and spot, and since a cell holds one block,
 * the first placement in a cell wins (ADR 0093, 0105). Storage compartments are laid by
 * compartmentCells, full or empty (ADR 0114, 0121).
 */
export function decorCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): DecorCell[] {
  const face = decorFace(pose.yaw);
  const laid = new Set<string>();
  return decor.flatMap(({ slot, item }) => {
    const s = decorSlot(slot);
    const pair = s?.pair?.kind;
    if (
      !s ||
      compartmentDoorAt(s.cell, STORAGE_DOORS) ||
      (pair !== undefined && isStoragePairKind(pair))
    )
      return [];
    const at = decorSlotCell(pose, s);
    const key = cellKey(at);
    if (laid.has(key)) return [];
    laid.add(key);
    const block: DecorCell["block"] = pair
      ? {
          type: "decorPair",
          pair,
          face,
          height: s.height,
          ...pairItems(s, decor),
        }
      : { type: "decor", item, face, height: s.height, spot: s.spot ?? 0 };
    return [{ ...at, block }];
  });
}

type FurnitureCell = DockCell & {
  readonly block: Extract<DockBlock, { type: "furniture" }>;
};

/**
 * A furniture block in every slot cell that holds no decor, at the height of the cell's first
 * slot, or the hanging box for a hanging slot, in DECOR_CELLS order (ADR 0097, 0102, 0105).
 * Storage compartments always hold their own block instead (ADR 0114, 0121).
 */
export function furnitureCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): FurnitureCell[] {
  return DECOR_CELLS.filter(
    ({ cell }) =>
      !compartmentDoorAt(cell, STORAGE_DOORS) && !decorInCell(cell, decor),
  ).map(({ cell, slots }) => {
    const first = slots[0];
    return {
      ...cellAt(pose, cell.x, cell.z, cell.layer),
      block: {
        type: "furniture",
        height:
          first === undefined || first.hanging
            ? HANGING_FURNITURE_HEIGHT
            : first.height,
      } as const,
    };
  });
}

/** Every slot cell once, in DECOR_CELLS order (ADR 0097, 0105). */
export function slotCells(pose: HoldPose): Vec3[] {
  return DECOR_CELLS.map(({ cell }) =>
    cellAt(pose, cell.x, cell.z, cell.layer),
  );
}

/**
 * The namespace-free name of the block the decor in `cell` lays: the pair block of the
 * table, or the decor block of the cell's item; undefined while the cell holds
 * no decor (ADR 0093, 0108). A storage compartment always lays its unit's pair block (ADR 0114, 0121).
 */
export function decorBlockName(
  cell: LocalCell,
  decor: readonly DecorPlacement[],
): string | undefined {
  const door = compartmentDoorAt(cell, STORAGE_DOORS);
  if (door) return `${door.unit.pairKind}_decor_pair`;
  const placed = decorInCell(cell, decor);
  const slot = placed && decorSlot(placed.slot);
  if (!placed || !slot) return undefined;
  return slot.pair ? `${slot.pair.kind}_decor_pair` : `${placed.item}_decor`;
}

/**
 * A slot cell lets the camper leave only while it holds air, the furniture block, or
 * `decorBlock`, the block its decor lays (decorBlockName; undefined for an empty cell)
 * (ADR 0093, 0097, 0108).
 */
export function ownSlotBlock(
  typeId: string | undefined,
  decorBlock: string | undefined,
): boolean {
  // An occupied slot may still hold its furniture block: decor placed this tick
  // is laid only on the next step.
  if (typeId === AIR || typeId?.endsWith(FURNITURE_BLOCK_SUFFIX) === true)
    return true;
  return (
    decorBlock !== undefined && typeId?.endsWith(`:${decorBlock}`) === true
  );
}
