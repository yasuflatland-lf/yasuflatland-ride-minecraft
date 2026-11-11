import { type CellBox, type Size, sizeOf } from "../box";

export function volumeSize(base: CellBox, height: number): Size {
  return { ...sizeOf(base), y: height };
}
