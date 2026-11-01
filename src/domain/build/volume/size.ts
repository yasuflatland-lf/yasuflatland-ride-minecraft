import type { Box } from "../box";

export function volumeSize(
  base: Box,
  height: number,
): { x: number; y: number; z: number } {
  return {
    x: base.max.x - base.min.x + 1,
    y: height,
    z: base.max.z - base.min.z + 1,
  };
}
