// The camper's decor slots, flattened from its furniture table (ADR 0093).
import type { DecorPlacement } from "../../dock/decor";
import { CAMPER_FURNITURE, type DecorSlot, type LocalCell } from "./furniture";

export const DECOR_SLOTS: readonly DecorSlot[] = CAMPER_FURNITURE.flatMap(
  (f) => f.slots,
);

export function decorSlot(id: string): DecorSlot | undefined {
  return DECOR_SLOTS.find((s) => s.id === id);
}

/** The slot heights of a two-item furniture's ends, lowest first: what its pair block is lifted by (ADR 0108). */
export function pairHeights(
  kind: NonNullable<DecorSlot["pair"]>["kind"],
): number[] {
  const heights = DECOR_SLOTS.filter((s) => s.pair?.kind === kind).map(
    (s) => s.height,
  );
  return [...new Set(heights)].sort((a, b) => a - b);
}

// The stove's burner slots of ADR 0107, removed when the stove got one burner; decor saved
// in them loads onto "stove" (ADR 0112).
const RENAMED_SLOTS: ReadonlyMap<string, string> = new Map([
  ["stove_rear", "stove"],
  ["stove_wall", "stove"],
  ["stove_wall_rear", "stove"],
]);

/** The slot id that decor saved under `id` loads onto: `id` unless that slot was renamed. */
export function savedSlotId(id: string): string {
  return RENAMED_SLOTS.get(id) ?? id;
}

function sameCell(a: LocalCell, b: LocalCell): boolean {
  return a.x === b.x && a.z === b.z && a.layer === b.layer;
}

/** The slots in `cell`, in DECOR_SLOTS order. */
function cellSlots(cell: LocalCell): DecorSlot[] {
  return DECOR_SLOTS.filter((s) => sameCell(s.cell, cell));
}

/** A cell that holds decor slots, with its slots in DECOR_SLOTS order. */
export interface DecorCell {
  readonly cell: LocalCell;
  readonly slots: readonly DecorSlot[];
}

/**
 * Every cell that holds a slot, once, in the order of its first slot. A cell holds one
 * block, so slots that share a cell share one decor or furniture block (ADR 0107), and both
 * ends of a shelf board or the table share one pair or furniture block (ADR 0108).
 */
export const DECOR_CELLS: readonly DecorCell[] = DECOR_SLOTS.filter(
  (slot, i) => DECOR_SLOTS.findIndex((s) => sameCell(s.cell, slot.cell)) === i,
).map(({ cell }) => ({ cell, slots: cellSlots(cell) }));

/** The decor in a known slot of `cell`, if any; the first one when the list holds several. */
export function decorInCell(
  cell: LocalCell,
  decor: readonly DecorPlacement[],
): DecorPlacement | undefined {
  return decor.find((d) => {
    const s = decorSlot(d.slot);
    return s !== undefined && sameCell(s.cell, cell);
  });
}

/**
 * The slots an item in `slot` keeps from taking another item: the slot alone on an end of a
 * shelf board or the table, whose pair block draws one item per end (ADR 0108), and every slot
 * of its cell otherwise, since the cell's decor block draws one item (ADR 0107).
 */
export function sharingSlots(slot: DecorSlot): DecorSlot[] {
  return slot.pair ? [slot] : cellSlots(slot.cell);
}

/** Whether `slot` cannot take an item: it, or a slot sharing its place, holds decor (ADR 0107, 0108). */
export function cellTaken(
  slot: DecorSlot,
  decor: readonly DecorPlacement[],
): boolean {
  const sharing = new Set(sharingSlots(slot).map((s) => s.id));
  return decor.some((d) => sharing.has(d.slot));
}
