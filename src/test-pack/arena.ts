// The in-game test arena and the fixtures that spawn vehicles in it (ADR 0010).
import {
  type Dimension,
  type Entity,
  system,
  type Vector3,
} from "@minecraft/server";
import type { Vec2 } from "../domain/shared/vec";
import {
  CHAIR_KINDS,
  DUTCH_OVEN_TYPE,
  TENT_TYPE,
} from "../infrastructure/camp/identifiers";
import {
  TEST_DECOR_EVENT as DECOR_EVENT,
  ENTITY_TYPE,
  TEST_INPUT_EVENT as INPUT_EVENT,
  SEAT_FILLER_TYPE,
} from "../infrastructure/vehicle/bedrock/identifiers";

import {
  areaBounds,
  inside,
  type Lane,
  LOCAL_ARENA,
  laneOf,
  SERIES_AREAS,
  toLocal,
  toWorld,
  worldBounds,
} from "./lane";
import { MAX_LANES } from "./protocol";

// Mirrors the SUV's minecraft:rideable but seats cows, because only players
// can ride the SUV and a test has no players (ADR 0010).
export const SEAT_PROBE = "yasu_ride_test:seat_probe";
export const BOAT_SEAT_PROBE = "yasu_ride_test:boat_seat_probe";

export interface Arena {
  readonly dim: Dimension;
  readonly gy: number;
  readonly lane: Lane;
  at(x: number, y: number, z: number): Vector3;
  xyz(x: number, y: number, z: number): string;
  box(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ): string;
  local(v: Vector3): Vector3;
}

function arenaOf(dim: Dimension, gy: number, lane: Lane): Arena {
  const at = (x: number, y: number, z: number): Vector3 =>
    toWorld(lane, { x, y, z });
  const xyz = (x: number, y: number, z: number): string => {
    const p = at(x, y, z);
    return `${p.x} ${p.y} ${p.z}`;
  };
  return {
    dim,
    gy,
    lane,
    at,
    xyz,
    box: (x1, y1, z1, x2, y2, z2) => `${xyz(x1, y1, z1)} ${xyz(x2, y2, z2)}`,
    local: (v) => toLocal(lane, v),
  };
}

// getBlock may return undefined or throw for an unloaded chunk.
export function blockLoaded(dimension: Dimension, location: Vector3): boolean {
  try {
    return dimension.getBlock(location) !== undefined;
  } catch {
    return false;
  }
}

export async function waitUntil(
  ticks: number,
  done: () => boolean,
): Promise<boolean> {
  for (let tick = 0; tick < ticks; tick++) {
    if (done()) return true;
    await wait(1);
  }
  return done();
}

export function wait(ticks: number): Promise<void> {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

/**
 * Whether a body that extends `halfWidth` to each side of `p` stays on the
 * arena floor.
 */
export function insideArena(p: Vec2, halfWidth: number): boolean {
  return inside(LOCAL_ARENA, p, halfWidth);
}

export function drive(car: Entity, x: number, y: number, jump = false): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},${x},${y},${jump ? 1 : 0}`);
}

export function clearInput(car: Entity): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},clear`);
}

export function setDecor(
  car: Entity,
  slot: string,
  item: string | undefined,
): void {
  system.sendScriptEvent(DECOR_EVENT, `${car.id},${slot},${item ?? "clear"}`);
}

export function spawnCar(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  type = ENTITY_TYPE.suv,
): Entity {
  a.dim.runCommand(`summon ${type} ${a.xyz(x, a.gy, z)}`);
  const car = a.dim.getEntities({
    type,
    location: a.at(x, a.gy, z),
    maxDistance: 1.5,
  })[0];
  if (!car) throw new Error(`car not spawned at ${x},${z}`);
  car.setRotation({ x: 0, y: yaw });
  return car;
}

export async function withCar<T>(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  run: (car: Entity) => Promise<T>,
  type = ENTITY_TYPE.suv,
): Promise<T> {
  const car = spawnCar(a, x, z, yaw, type);
  try {
    return await run(car);
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
  }
}

export function withCamper<T>(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, x, z, yaw, run, ENTITY_TYPE.camper);
}

const GROUND_PROBE = { x: 5, z: 20 } as const;

function arenaLoaded(dim: Dimension, lane: Lane, y: number): boolean {
  const b = worldBounds(lane, LOCAL_ARENA);
  return [b.minX, b.maxX].every((x) =>
    [b.minZ, b.maxZ].every((z) => blockLoaded(dim, { x, y, z })),
  );
}

const VEHICLE_TYPES = [
  ENTITY_TYPE.suv,
  ENTITY_TYPE.sportsboat,
  ENTITY_TYPE.camper,
  ENTITY_TYPE.bulldozer,
] as const;

export async function prepareRun(
  dim: Dimension,
  lanes: readonly Lane[],
): Promise<Arena[]> {
  for (const name of SERIES_AREAS) {
    try {
      dim.runCommand(`tickingarea remove ${name}`);
    } catch {
      // Missing series areas are normal on the first run.
    }
  }
  await wait(2);
  const allLanes = Array.from({ length: MAX_LANES }, (_, index) =>
    laneOf(index),
  );
  for (const lane of allLanes) {
    const b = areaBounds(lane);
    try {
      const result = dim.runCommand(
        `tickingarea add ${b.minX} -64 ${b.minZ} ${b.maxX} 0 ${b.maxZ} ${lane.tickingArea} true`,
      );
      if (result.successCount <= 0) throw new Error("area not added");
    } catch (e) {
      throw new Error(
        `ticking area limit reached; check tickingarea list (${lane.tickingArea}: ${e})`,
      );
    }
  }
  for (const lane of allLanes) {
    if (!(await waitUntil(200, () => arenaLoaded(dim, lane, 0))))
      throw new Error(`lane ${lane.index} not loaded (corners)`);
  }
  const top = dim.getTopmostBlock(toWorld(laneOf(0), GROUND_PROBE));
  if (!top) throw new Error("lane 0 not loaded");
  const gy = top.location.y + 1;
  for (const lane of lanes) {
    const laneTop = dim.getTopmostBlock(toWorld(lane, GROUND_PROBE));
    if (!laneTop) throw new Error(`lane ${lane.index} not loaded (corners)`);
    if (laneTop.location.y + 1 !== gy)
      throw new Error(`lane ${lane.index} ground height differs from lane 0`);
  }
  for (const type of VEHICLE_TYPES) dim.runCommand(`kill @e[type=${type}]`);
  for (const { typeId } of Object.values(CHAIR_KINDS))
    dim.runCommand(`kill @e[type=${typeId}]`);
  dim.runCommand(`kill @e[type=${TENT_TYPE}]`);
  dim.runCommand(`kill @e[type=${DUTCH_OVEN_TYPE}]`);
  dim.runCommand("kill @e[type=cow]");
  dim.runCommand(`kill @e[type=${SEAT_PROBE}]`);
  dim.runCommand(`kill @e[type=${BOAT_SEAT_PROBE}]`);
  dim.runCommand(`kill @e[type=${SEAT_FILLER_TYPE}]`);
  // The pool's water replaces the stone under passable_no_hop's carpets and
  // torches, which then drop as items.
  dim.runCommand("kill @e[type=item]");
  await wait(5);
  for (const lane of allLanes) {
    if (!lanes.some((used) => used.index === lane.index))
      dim.runCommand(`tickingarea remove ${lane.tickingArea}`);
  }
  const arenas = lanes.map((lane) => arenaOf(dim, gy, lane));
  const { minX, maxX, minZ, maxZ } = LOCAL_ARENA;
  const midX = (minX + maxX) / 2;
  const midZ = Math.floor((minZ + maxZ) / 2);
  for (const [index, a] of arenas.entries()) {
    if (index > 0) await wait(1);
    // successCount is 0 both for an unloaded chunk and for a fill that changes
    // nothing (air over air on a rerun), so loading is checked on the corners.
    if (!arenaLoaded(dim, a.lane, gy))
      throw new Error(`lane ${a.lane.index} not loaded (fill)`);
    // fill is capped at 32,768 blocks per call, so split the clear in four.
    for (const [x0, x1] of [
      [minX, midX],
      [midX + 1, maxX],
    ] as const)
      for (const [z0, z1] of [
        [minZ, midZ],
        [midZ + 1, maxZ],
      ] as const)
        dim.runCommand(`fill ${a.box(x0, gy, z0, x1, gy + 6, z1)} air`);
    dim.runCommand(
      `fill ${a.box(minX, gy - 1, minZ, maxX, gy - 1, maxZ)} stone`,
    );
    // Flight tests climb about eight blocks above the floor along z = 4.5.
    dim.runCommand(`fill ${a.box(minX, gy + 7, 0, 60, gy + 20, 12)} air`);
  }
  await wait(5);
  return arenas;
}

// A runaway vehicle from a lane would otherwise hold an unowned slot that
// vehicle_limit and fleet_forget count.
export async function removeVehicles(dim: Dimension): Promise<void> {
  for (const type of VEHICLE_TYPES) {
    for (const entity of dim.getEntities({ type })) entity.remove();
  }
  await wait(5);
}

// 80 blocks across z, so a submarine has room to turn (submarine_bank); the
// lane runs along the low-z edge and right turns head into the open water.
export const POOL = { minX: 15, maxX: 85, minZ: 2, maxZ: 81, z: 7.5 } as const;

export async function withPool<T>(
  a: Arena,
  depth: number,
  run: () => Promise<T>,
  liquid: "water" | "lava" = "water",
): Promise<T> {
  const { minX, maxX, minZ, maxZ } = POOL;
  const bottom = a.gy - depth;
  const worldMin = a.dim.heightRange.min;
  if (bottom - 1 < worldMin)
    throw new Error(
      `Pool of depth ${depth} needs a floor at y=${bottom - 1}, below the world's minimum y=${worldMin}`,
    );
  const fillPool = (block: string) =>
    a.dim.runCommand(
      `fill ${a.box(minX, bottom, minZ, maxX, a.gy - 1, maxZ)} ${block}`,
    );
  a.dim.runCommand(
    `fill ${a.box(minX, bottom - 1, minZ, maxX, bottom - 1, maxZ)} stone`,
  );
  // Contain the water even when the arena's original terrain has caves.
  for (const x of [minX - 1, maxX + 1])
    a.dim.runCommand(
      `fill ${a.box(x, bottom, minZ - 1, x, a.gy - 1, maxZ + 1)} stone`,
    );
  for (const z of [minZ - 1, maxZ + 1])
    a.dim.runCommand(`fill ${a.box(minX, bottom, z, maxX, a.gy - 1, z)} stone`);
  // runCommand reports a fill into unloaded chunks as successCount 0 instead
  // of throwing. Seen in game with an arena ticking area kept from a smaller
  // arena under the same name: every submarine test then failed with
  // enteredAt=-1.
  const bounds = worldBounds(a.lane, LOCAL_ARENA);
  if (fillPool(liquid).successCount === 0)
    throw new Error(
      `the pool was not filled: check that "tickingarea list" shows ${a.lane.tickingArea} covering x ${bounds.minX}-${bounds.maxX}, z ${bounds.minZ}-${bounds.maxZ}`,
    );
  try {
    await wait(5);
    return await run();
  } finally {
    fillPool("air");
    a.dim.runCommand(
      `fill ${a.box(minX, a.gy - 1, minZ, maxX, a.gy - 1, maxZ)} stone`,
    );
  }
}

export async function withBoat<T>(
  a: Arena,
  run: (boat: Entity) => Promise<T>,
  start: Vec2 & { yaw: number } = {
    x: POOL.minX + 5.5,
    z: POOL.z,
    yaw: -90,
  },
  settleTicks = 40,
): Promise<T> {
  const { x, z } = start;
  a.dim.runCommand(`summon ${ENTITY_TYPE.sportsboat} ${a.xyz(x, a.gy, z)}`);
  const boat = a.dim.getEntities({
    type: ENTITY_TYPE.sportsboat,
    location: a.at(x, a.gy, z),
    maxDistance: 1.5,
  })[0];
  if (!boat) throw new Error("boat not spawned at the pool surface");
  boat.setRotation({ x: 0, y: start.yaw });
  try {
    if (settleTicks > 0) await wait(settleTicks); // Let the boat settle on the water
    return await run(boat);
  } finally {
    clearInput(boat);
    if (boat.isValid) boat.remove();
  }
}
