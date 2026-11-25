import { MAX_LANES } from "./protocol.ts";

export interface XZ {
  readonly x: number;
  readonly z: number;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export const LOCAL_ARENA: Bounds = { minX: 0, maxX: 120, minZ: 0, maxZ: 90 };
export const AREA_MARGIN = 16;
// Round the arena and its margins up to a whole number of chunks.
export const LANE_STRIDE = 160;

export interface Lane {
  readonly index: number;
  readonly origin: XZ;
  readonly tickingArea: string;
}

export function laneOf(index: number): Lane {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_LANES)
    throw new Error(`invalid lane index: ${index}`);
  return {
    index,
    origin: { x: index * LANE_STRIDE, z: 0 },
    tickingArea: index === 0 ? "yasu_ride_arena" : `yasu_ride_arena_${index}`,
  };
}

export function toWorld<T extends XZ>(lane: Lane, p: T): T {
  return { ...p, x: p.x + lane.origin.x, z: p.z + lane.origin.z };
}

export function toLocal<T extends XZ>(lane: Lane, p: T): T {
  return { ...p, x: p.x - lane.origin.x, z: p.z - lane.origin.z };
}

export function worldBounds(lane: Lane, b: Bounds): Bounds {
  return {
    minX: b.minX + lane.origin.x,
    maxX: b.maxX + lane.origin.x,
    minZ: b.minZ + lane.origin.z,
    maxZ: b.maxZ + lane.origin.z,
  };
}

export function areaBounds(lane: Lane): Bounds {
  const b = worldBounds(lane, LOCAL_ARENA);
  return {
    minX: b.minX - AREA_MARGIN,
    maxX: b.maxX + AREA_MARGIN,
    minZ: b.minZ - AREA_MARGIN,
    maxZ: b.maxZ + AREA_MARGIN,
  };
}

export function addAreaCommand(lane: Lane): string {
  const b = areaBounds(lane);
  return `tickingarea add ${b.minX} -64 ${b.minZ} ${b.maxX} 0 ${b.maxZ} ${lane.tickingArea} true`;
}

export function inside(b: Bounds, p: XZ, halfWidth: number): boolean {
  return (
    p.x >= b.minX + halfWidth &&
    p.x <= b.maxX + 1 - halfWidth &&
    p.z >= b.minZ + halfWidth &&
    p.z <= b.maxZ + 1 - halfWidth
  );
}

// Bedrock allows ten ticking areas, leaving two slots when all lanes are used.
export const BOOST_RUNWAYS: readonly Lane[] = Array.from(
  { length: 10 - MAX_LANES },
  (_, slot) => ({
    index: MAX_LANES + slot,
    origin: { x: (MAX_LANES + slot) * LANE_STRIDE, z: 0 },
    tickingArea: `yasu_ride_boost_runway_${slot}`,
  }),
);

export const BOOST_RUNWAY_BOUNDS: Bounds = {
  minX: 16,
  maxX: 47,
  minZ: 0,
  maxZ: 550,
};

export const UNLOAD_AREA = "yasu_ride_unload_spike";
export const SERIES_AREAS: readonly string[] = [
  ...Array.from({ length: MAX_LANES }, (_, index) => laneOf(index)).flatMap(
    ({ tickingArea }) => [tickingArea, `${tickingArea}_runway`],
  ),
  ...BOOST_RUNWAYS.map((runway) => runway.tickingArea),
  UNLOAD_AREA,
];
