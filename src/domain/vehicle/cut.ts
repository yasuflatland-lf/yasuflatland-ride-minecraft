/** One block column a drive clears this tick (ADR 0137). */
export interface CutColumn {
  readonly x: number;
  readonly z: number;
  /** The lowest cell cut: floor of the feet. */
  readonly bottom: number;
  /** Cells cut from `bottom` up; undefined cuts every cell up to the first air cell above `bottom`, or the world's top. */
  readonly height?: number;
}
