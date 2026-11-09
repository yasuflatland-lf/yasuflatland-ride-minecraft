import type { Brand } from "../../shared/ids";

/** The opaque id of one saved engine structure. */
export type StructureHandle = Brand<string, "StructureHandle">;

/**
 * Brands a string as a structure handle. Returns its argument unchanged;
 * throws on an empty string, since an empty name cannot identify a structure.
 */
export function structureHandle(raw: string): StructureHandle {
  if (raw.length === 0) {
    throw new Error("A structure handle cannot be empty.");
  }
  return raw as StructureHandle;
}
