// The camper's decor slots, flattened from its furniture table (ADR 0093).
import type { DecorPlacement } from "../../dock/decor";
import { CAMPER_FURNITURE, type DecorSlot, type LocalCell } from "./furniture";

export const DECOR_SLOTS: readonly DecorSlot[] = CAMPER_FURNITURE.flatMap(
  (f) => f.slots,
);

export function decorSlot(id: string): DecorSlot | undefined {
  return DECOR_SLOTS.find((s) => s.id === id);
}

function sameCell(a: LocalCell, b: LocalCell): boolean {
  return a.x === b.x && a.z === b.z && a.layer === b.layer;
}

/** The slots in `cell`, in DECOR_SLOTS order. */
export function cellSlots(cell: LocalCell): DecorSlot[] {
  return DECOR_SLOTS.filter((s) => sameCell(s.cell, cell));
}

/** A cell that holds decor slots, with its slots in DECOR_SLOTS order. */
export interface DecorCell {
  readonly cell: LocalCell;
  readonly slots: readonly DecorSlot[];
}

/**
 * Every cell that holds a slot, once, in the order of its first slot. A cell holds one
 * block, so the stove's four burner slots share one decor or furniture block (ADR 0107).
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

/** Whether any slot in `slot`'s cell holds decor: a cell holds one item (ADR 0107). */
export function cellTaken(
  slot: DecorSlot,
  decor: readonly DecorPlacement[],
): boolean {
  return decorInCell(slot.cell, decor) !== undefined;
}
