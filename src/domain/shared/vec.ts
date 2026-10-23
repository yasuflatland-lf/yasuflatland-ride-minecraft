export interface Vec2 {
  readonly x: number;
  readonly z: number;
}
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** The direction a Minecraft yaw (in degrees) faces. yaw 0 = +z (south), yaw -90 = +x (east). */
export function forward(yawDeg: number): Vec2 {
  const r = degToRad(yawDeg);
  return { x: -Math.sin(r), z: Math.cos(r) };
}

export function rightOf(f: Vec2): Vec2 {
  return { x: -f.z, z: f.x };
}

export function leftOf(f: Vec2): Vec2 {
  return { x: f.z, z: -f.x };
}

/**
 * The world offset of a point `ahead` blocks along `f` and `right` blocks to
 * its right (negative `right` is to the left).
 */
export function localOffset(f: Vec2, ahead: number, right: number): Vec2 {
  const r = rightOf(f);
  return { x: f.x * ahead + r.x * right, z: f.z * ahead + r.z * right };
}

/**
 * The world point `ahead` blocks along `f` and `right` blocks to the right of
 * `origin` (negative `right` is to the left). Adds in the order
 * origin + ahead + right, which callers that floor the result rely on.
 */
export function localPoint(
  origin: Vec2,
  f: Vec2,
  ahead: number,
  right: number,
): Vec2 {
  const r = rightOf(f);
  return {
    x: origin.x + f.x * ahead + r.x * right,
    z: origin.z + f.z * ahead + r.z * right,
  };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

export function length(v: Vec2): number {
  return Math.hypot(v.x, v.z);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Moves `prev` toward `target` by at most `up` when the target is higher and
 * at most `down` when it is lower, never passing the target.
 */
export function approach(
  prev: number,
  target: number,
  up: number,
  down: number = up,
): number {
  return prev + clamp(target - prev, -down, up);
}

export function clampLength(v: Vec2, max: number): Vec2 {
  const l = length(v);
  return l > max && l > 0 ? { x: (v.x * max) / l, z: (v.z * max) / l } : v;
}

/** Wraps yaw into (-180, 180]. */
export function normalizeYaw(yaw: number): number {
  const n = ((((yaw + 180) % 360) + 360) % 360) - 180;
  return n === -180 ? 180 : n;
}
