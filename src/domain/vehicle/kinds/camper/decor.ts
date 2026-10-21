// The camper's decor slots, flattened from its furniture table (ADR 0093).
import { CAMPER_FURNITURE, type DecorSlot } from "./furniture";

export const DECOR_SLOTS: readonly DecorSlot[] = CAMPER_FURNITURE.flatMap(
  (f) => f.slots,
);

export function decorSlot(id: string): DecorSlot | undefined {
  return DECOR_SLOTS.find((s) => s.id === id);
}
