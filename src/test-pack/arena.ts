// The in-game test arena and the fixtures that spawn vehicles in it (ADR 0010).
import { type Dimension, type Entity, system, world } from "@minecraft/server";
import type { Vec2 } from "../domain/shared/vec";
import {
  ENTITY_TYPE,
  TEST_INPUT_EVENT as INPUT_EVENT,
} from "../infrastructure/vehicle/bedrock/identifiers";

// setupArena clears and floors this x/z rectangle and keeps it ticking.
const ARENA = { minX: 0, maxX: 120, minZ: 0, maxZ: 90 } as const;

// Mirrors the SUV's minecraft:rideable but seats cows, because only players
// can ride the SUV and a test has no players (ADR 0010).
export const SEAT_PROBE = "yasu_ride_test:seat_probe";

export interface Outcome {
  pass: boolean;
  detail: string;
  lines?: string[];
}
export interface Arena {
  dim: Dimension;
  gy: number;
}

export function wait(ticks: number): Promise<void> {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

/**
 * Whether a body that extends `halfWidth` to each side of `p` stays on the
 * arena floor.
 */
export function insideArena(p: Vec2, halfWidth: number): boolean {
  return (
    p.x >= ARENA.minX + halfWidth &&
    p.x <= ARENA.maxX + 1 - halfWidth &&
    p.z >= ARENA.minZ + halfWidth &&
    p.z <= ARENA.maxZ + 1 - halfWidth
  );
}

export function drive(car: Entity, x: number, y: number, jump = false): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},${x},${y},${jump ? 1 : 0}`);
}

export function clearInput(car: Entity): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},clear`);
}

export function spawnCar(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  type = ENTITY_TYPE.suv,
): Entity {
  a.dim.runCommand(`summon ${type} ${x} ${a.gy} ${z}`);
  const car = a.dim.getEntities({
    type,
    location: { x, y: a.gy, z },
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

export async function setupArena(): Promise<Arena> {
  const dim = world.getDimension("overworld");
  const { minX, maxX, minZ, maxZ } = ARENA;
  // An existing area of the same name keeps its old bounds; withPool reports
  // the fill that then fails in the chunks left out.
  dim.runCommand(
    `tickingarea add ${minX} -64 ${minZ} ${maxX} 0 ${maxZ} yasu_ride_arena true`,
  );
  await wait(60);
  const top = dim.getTopmostBlock({ x: 5, z: 20 });
  if (!top) throw new Error("arena chunk not loaded");
  const gy = top.location.y + 1;
  // fill is capped at 32,768 blocks per call, so the clear is split in four.
  const midX = (minX + maxX) / 2;
  const midZ = Math.floor((minZ + maxZ) / 2);
  for (const [x0, x1] of [
    [minX, midX],
    [midX + 1, maxX],
  ])
    for (const [z0, z1] of [
      [minZ, midZ],
      [midZ + 1, maxZ],
    ])
      dim.runCommand(`fill ${x0} ${gy} ${z0} ${x1} ${gy + 6} ${z1} air`);
  dim.runCommand(
    `fill ${minX} ${gy - 1} ${minZ} ${maxX} ${gy - 1} ${maxZ} stone`,
  );
  // The flight tests climb up to about 8 blocks above the floor along z = 4.5.
  dim.runCommand(`fill ${minX} ${gy + 7} 0 60 ${gy + 20} 12 air`);
  dim.runCommand(`kill @e[type=${ENTITY_TYPE.suv}]`);
  dim.runCommand(`kill @e[type=${ENTITY_TYPE.sportsboat}]`);
  dim.runCommand(`kill @e[type=${ENTITY_TYPE.camper}]`);
  dim.runCommand("kill @e[type=cow]");
  dim.runCommand(`kill @e[type=${SEAT_PROBE}]`);
  // The pool's water replaces the stone under passable_no_hop's carpets and
  // torches, which then drop as items.
  dim.runCommand("kill @e[type=item]");
  await wait(5);
  return { dim, gy };
}

// 80 blocks across z, so a submarine has room to turn (submarine_bank); the
// lane runs along the low-z edge and right turns head into the open water.
export const POOL = { minX: 15, maxX: 85, minZ: 2, maxZ: 81, z: 7.5 } as const;

export async function withPool<T>(
  a: Arena,
  depth: number,
  run: () => Promise<T>,
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
      `fill ${minX} ${bottom} ${minZ} ${maxX} ${a.gy - 1} ${maxZ} ${block}`,
    );
  a.dim.runCommand(
    `fill ${minX} ${bottom - 1} ${minZ} ${maxX} ${bottom - 1} ${maxZ} stone`,
  );
  // Contain the water even when the arena's original terrain has caves.
  for (const x of [minX - 1, maxX + 1])
    a.dim.runCommand(
      `fill ${x} ${bottom} ${minZ - 1} ${x} ${a.gy - 1} ${maxZ + 1} stone`,
    );
  for (const z of [minZ - 1, maxZ + 1])
    a.dim.runCommand(
      `fill ${minX} ${bottom} ${z} ${maxX} ${a.gy - 1} ${z} stone`,
    );
  // runCommand reports a fill into unloaded chunks as successCount 0 instead
  // of throwing. Seen in game with an arena ticking area kept from a smaller
  // arena under the same name: every submarine test then failed with
  // enteredAt=-1.
  if (fillPool("water").successCount === 0)
    throw new Error(
      `the pool was not filled: check that "tickingarea list" shows yasu_ride_arena covering x ${ARENA.minX}-${ARENA.maxX}, z ${ARENA.minZ}-${ARENA.maxZ}`,
    );
  try {
    await wait(5);
    return await run();
  } finally {
    fillPool("air");
    a.dim.runCommand(
      `fill ${minX} ${a.gy - 1} ${minZ} ${maxX} ${a.gy - 1} ${maxZ} stone`,
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
  a.dim.runCommand(`summon ${ENTITY_TYPE.sportsboat} ${x} ${a.gy} ${z}`);
  const boat = a.dim.getEntities({
    type: ENTITY_TYPE.sportsboat,
    location: { x, y: a.gy, z },
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
