export type Facing4 = 0 | 90 | 180 | 270;

/** Quarter turns like the ground tent's yawStep; half-step ties round toward positive yaw. */
export function snapYaw4(yaw: number): Facing4 {
  const quarter = ((Math.round(yaw / 90) % 4) + 4) % 4;
  return (quarter * 90) as Facing4;
}
