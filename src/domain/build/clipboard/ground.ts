import { boxFromSize, type CellBox, sizeOf } from "../box";

export function snapToGround(
  box: CellBox,
  topOf: (x: number, z: number) => number | undefined,
): CellBox | undefined {
  let highest: number | undefined;
  for (let z = box.min.z; z <= box.max.z; z++) {
    for (let x = box.min.x; x <= box.max.x; x++) {
      const top = topOf(x, z);
      if (top !== undefined) highest = Math.max(highest ?? top, top);
    }
  }
  return highest === undefined
    ? undefined
    : boxFromSize({ ...box.min, y: highest + 1 }, sizeOf(box));
}
