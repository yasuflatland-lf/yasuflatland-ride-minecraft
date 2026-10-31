/** One block column a drive clears this tick (ADR 0137). */
export type CutColumn = {
  readonly x: number;
  readonly z: number;
  /** The lowest cell cut: floor of the feet. */
  readonly bottom: number;
} & (
  | {
      /** Exact cells cut from bottom, ignoring the non-air run. */
      readonly height?: number;
      readonly minHeight?: never;
    }
  | {
      readonly height?: never;
      /** Cells from bottom that are cut even when the run is broken by air; the run above them still continues while it is non-air. */
      readonly minHeight?: number;
    }
);
