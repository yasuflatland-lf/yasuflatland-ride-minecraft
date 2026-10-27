import { degToRad, type Vec3 } from "../shared/vec";

export type DutchOvenId = string & { readonly __brand: "DutchOvenId" };

export function asDutchOvenId(value: string): DutchOvenId {
  return value as DutchOvenId;
}

export type OvenHost =
  | { kind: "ground" }
  | { kind: "fire_pit"; id: string; spot: number }
  | { kind: "camp_table"; id: string; spot: number };

/** Simmering depends on the host, even when the fire is unlit (ADR 0168). */
export function isSimmering(host: OvenHost): boolean {
  return host.kind === "fire_pit";
}

export function encodeHost(host: OvenHost): string {
  return host.kind === "ground" ? "" : `${host.kind}:${host.id}:${host.spot}`;
}

export function decodeHost(text: string): OvenHost {
  const match = /^(fire_pit|camp_table):(.+):(0|[1-9][0-9]*)$/s.exec(text);
  if (!match) return { kind: "ground" };
  const [, kind, id, rawSpot] = match;
  const spot = Number(rawSpot);
  if (
    (kind !== "fire_pit" && kind !== "camp_table") ||
    !id ||
    !Number.isSafeInteger(spot)
  )
    return { kind: "ground" };
  return { kind, id, spot };
}

export function nearestFreeSpot(
  spots: readonly { x: number; z: number }[],
  taken: ReadonlySet<number>,
  point: { x: number; z: number },
): number | undefined {
  let nearest: number | undefined;
  let distance = Infinity;
  spots.forEach((spot, index) => {
    if (taken.has(index)) return;
    const squared = (spot.x - point.x) ** 2 + (spot.z - point.z) ** 2;
    if (squared < distance) {
      nearest = index;
      distance = squared;
    }
  });
  return nearest;
}

export function aimOnPlane(
  head: Vec3,
  dir: Vec3,
  planeY: number,
): Vec3 | undefined {
  if (dir.y === 0) return undefined;
  const t = (planeY - head.y) / dir.y;
  if (t < 0) return undefined;
  return { x: head.x + dir.x * t, y: planeY, z: head.z + dir.z * t };
}

interface PlacedHost {
  readonly at: Vec3;
  readonly yaw: number;
}

/** The world point of a host spot given in model pixels, on a top `topPx` up. */
export function hostSpotPoint(
  host: PlacedHost,
  spot: { x: number; z: number },
  topPx: number,
): Vec3 {
  const angle = degToRad(host.yaw);
  return {
    x: host.at.x + (spot.x * Math.cos(angle) - spot.z * Math.sin(angle)) / 16,
    y: host.at.y + topPx / 16,
    z: host.at.z + (spot.x * Math.sin(angle) + spot.z * Math.cos(angle)) / 16,
  };
}

/** The inverse of `hostSpotPoint` on the horizontal plane, in model pixels. */
export function hostLocalPx(
  host: PlacedHost,
  point: Vec3,
): { x: number; z: number } {
  const angle = degToRad(host.yaw);
  const dx = point.x - host.at.x;
  const dz = point.z - host.at.z;
  return {
    x: (dx * Math.cos(angle) + dz * Math.sin(angle)) * 16,
    z: (-dx * Math.sin(angle) + dz * Math.cos(angle)) * 16,
  };
}
