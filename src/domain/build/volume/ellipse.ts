export interface EllipseBounds {
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

export function* ellipseCells({
  uMin,
  uMax,
  vMin,
  vMax,
}: EllipseBounds): Generator<{
  u: number;
  v: number;
  wall: boolean;
}> {
  const widthSquared = (uMax - uMin + 1) ** 2;
  const depthSquared = (vMax - vMin + 1) ** 2;
  const inside = (u: number, v: number): boolean =>
    (2 * u - uMin - uMax) ** 2 * depthSquared +
      (2 * v - vMin - vMax) ** 2 * widthSquared <=
    widthSquared * depthSquared;

  for (let v = vMin; v <= vMax; v++) {
    for (let u = uMin; u <= uMax; u++) {
      if (!inside(u, v)) continue;
      const wall =
        !inside(u - 1, v) ||
        !inside(u + 1, v) ||
        !inside(u, v - 1) ||
        !inside(u, v + 1);
      yield { u, v, wall };
    }
  }
}
