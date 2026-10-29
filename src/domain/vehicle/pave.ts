import type { Vec3 } from "../shared/vec";

/** Road blocks to lay this tick. The drive emits only cells the road may go into; the adapter lays `block` into each one unless the cell is unloaded, already `block`, laid-tagged, in PLACE_KEPT_BLOCKS, or camp space (ADR 0181). */
export interface Pave {
  /** Namespaced block type ID, laid in its default state. */
  readonly block: string;
  readonly cells: readonly Vec3[];
}
