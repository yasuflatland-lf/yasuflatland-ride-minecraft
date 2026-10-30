import { BlockPermutation, type Entity } from "@minecraft/server";
import { forward, length, type Vec3 } from "../../domain/shared/vec";
import type { DecorPlacement } from "../../domain/vehicle/dock/decor";
import type {
  DockBlock,
  DockCell,
  HoldPose,
} from "../../domain/vehicle/dock/floor";
import { storageDoors } from "../../domain/vehicle/kinds/camper/dooredStorage";
import {
  type CAMPER_STORAGE,
  FRIDGE,
  WALL_CABINET,
} from "../../domain/vehicle/kinds/camper/furniture";
import { CAMPER_PROFILE } from "../../domain/vehicle/kinds/camper/profile";
import {
  bedSpawnCell,
  cargoCells,
  compartmentCells,
  deckSeats,
  decorCells,
  furnitureCells,
  localCellAt,
  parkPose,
  roomCells,
} from "../../domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../domain/vehicle/kinds/camper/spec";
import { DOCK } from "../../domain/vehicle/motion/dock";
import { AIR_BLOCK } from "../../infrastructure/shared/identifiers";
import { LIGHT_BLOCK } from "../../infrastructure/shared/lightBlocks";
import { DOCK_RECHECK_TICKS } from "../../infrastructure/vehicle/bedrock/dockBlocks";
import {
  CAMPER_BED_BLOCK,
  CAMPER_BUNK_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_TYPE,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  DECOR_SPOT_STATE,
  decorBlockId,
  pairDecorBlockId,
  pairEndStates,
  pairHeightStates,
  ROOM_FACE_STATE,
  ROOM_LIT_STATE,
  ROOM_OPEN_STATE,
  STAND_IN_FAMILY,
  standInType,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, drive, setDecor, wait, withCamper } from "../arena";
import type { Outcome } from "../outcome";
import {
  FLIGHT_PATH,
  gearDownLandingOutcome,
  takeOff,
  takeoffOutcome,
  ticksToReach,
  ticksUntilForm,
} from "./shared";

// Clear of the other tests: camper_accel's lane at z 85, the dive tank at z 61-69,
// and the pool and flight lanes west of x 90.
const PARK_SPOT = { x: 108.5, z: 78.5, yaw: 90 } as const;

// Test bounds, not ADR values: the toilet seat stands about 3.2 blocks from the
// camper, so a 5-block search finds all five seats; 0.1 allows for the seat
// teleport tolerance; departure must clear every seat within the orphan-check
// radius of deckSeats.ts within half a second.
const CAMPER_DECK_SEATS_TEST = {
  count: 5,
  radius: 5,
  tolerance: 0.1,
  clearRadius: 9,
  clearTicks: 10,
} as const;

// Test bounds, not ADR values: 8 blocks finds every stand-in of a camper whose bumper is
// 3.7 blocks out; a parked one stands within a pixel of its spot (the teleport
// tolerance), and a driving one trails the body by one tick's move, under 1.5 blocks at
// the speeds a 15-tick start reaches.
const CAMPER_BUMPER_TEST = {
  radius: 8,
  parkedTolerance: 0.1,
  drivingTolerance: 1.5,
  driveTicks: 15,
  clearTicks: 3,
} as const;

// Test bound, not an ADR value: a lost cell is laid again on the next check,
// at most DOCK_RECHECK_TICKS lays later; twice that allows for a slow tick.
const CAMPER_RELAY_TICKS = DOCK_RECHECK_TICKS * 2;
// The room blocks a parked camper lays with its doors shut: the wall cabinet's two cells are
// cabinet blocks, not room blocks, since ADR 0114, and the fridge's are its compartment blocks
// in cells the shelf left to its pair blocks (ADR 0123).
const ROOM_CELL_COUNT = 107;

const ROOM_BLOCK: Readonly<
  Record<
    Exclude<DockBlock["type"], "decor" | "decorPair" | "cabinet" | "fridge">,
    string
  >
> = {
  deck: DECK_FLOOR_BLOCK,
  floor: CAMPER_FLOOR_BLOCK,
  ceiling: CAMPER_CEILING_BLOCK,
  wall: CAMPER_WALL_BLOCK,
  door: CAMPER_DOOR_BLOCK,
  bed: CAMPER_BED_BLOCK,
  bunk: CAMPER_BUNK_BLOCK,
  furniture: CAMPER_FURNITURE_BLOCK,
  showerToilet: CAMPER_SHOWER_TOILET_BLOCK,
  cabinetDoor: CAMPER_CABINET_DOOR_BLOCK,
  fridgeDoor: CAMPER_FRIDGE_DOOR_BLOCK,
  showerDoor: CAMPER_SHOWER_DOOR_BLOCK,
  light: LIGHT_BLOCK,
};

function laidTypeOf(block: DockBlock): string {
  if (block.type === "decor") return decorBlockId(block.item);
  if (block.type === "decorPair") return pairDecorBlockId(block.pair);
  if (block.type === "cabinet" || block.type === "fridge")
    return pairDecorBlockId(block.type);
  return ROOM_BLOCK[block.type];
}

function carPose(car: Entity): HoldPose {
  return parkPose(car.location, car.getRotation().y);
}

function parkSpotPose(a: Arena): HoldPose {
  return parkPose({ x: PARK_SPOT.x, y: a.gy, z: PARK_SPOT.z }, PARK_SPOT.yaw);
}

function countLaid(a: Arena, cells: readonly DockCell[]): number {
  return cells.filter((c) => a.dim.getBlock(c)?.typeId === laidTypeOf(c.block))
    .length;
}

function laidRoomCells(a: Arena, car: Entity): number {
  return countLaid(a, roomCells(carPose(car), false));
}

function movedFrom(car: Entity, pose: HoldPose): number {
  return Math.hypot(car.location.x - pose.x, car.location.z - pose.z);
}

// Removing the camper clears its room a tick later; the fill also clears what a
// test placed, so the next test starts on bare ground.
async function atParkSpot(
  a: Arena,
  run: (car: Entity) => Promise<Outcome>,
): Promise<Outcome> {
  try {
    return await withCamper(a, PARK_SPOT.x, PARK_SPOT.z, PARK_SPOT.yaw, run);
  } finally {
    a.dim.runCommand(`fill 103 ${a.gy} 73 114 ${a.gy + 5} 84 air`);
  }
}

// ADR 0119: on grassland a camper parks over a grass block rising into a floor cell outside
// its collision box, clears the plants, and lifts its bumper stand-in out of a grass block
// in front of the bumper.
export async function camperParkGrass(a: Arena): Promise<Outcome> {
  const ground = a.gy - 1;
  a.dim.runCommand(`fill 103 ${ground} 73 114 ${ground} 84 grass_block`);
  const pose = parkSpotPose(a);
  const raised = localCellAt(pose, { x: 1, z: 3, layer: 0 });
  const bumper = localCellAt(pose, { x: 0, z: 4, layer: 0 });
  const plants = [
    { at: localCellAt(pose, { x: 0, z: 2, layer: 0 }), type: "short_grass" },
    { at: localCellAt(pose, { x: -1, z: -2, layer: 0 }), type: "red_mushroom" },
    { at: localCellAt(pose, { x: 1, z: 4, layer: 0 }), type: "short_grass" },
  ];
  for (const c of [raised, bumper])
    a.dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} grass_block`);
  for (const { at, type } of plants)
    a.dim.runCommand(`setblock ${at.x} ${at.y} ${at.z} ${type}`);
  try {
    return await atParkSpot(a, async (car) => {
      await wait(DOCK.ticks + 10);
      const laid = laidRoomCells(a, car);
      const kept = [raised, bumper].filter(
        (c) => a.dim.getBlock(c)?.typeId === "minecraft:grass_block",
      ).length;
      const left = plants.filter(
        ({ at, type }) => a.dim.getBlock(at)?.typeId === `minecraft:${type}`,
      ).length;
      const [standIn] = a.dim.getEntities({
        families: [STAND_IN_FAMILY],
        location: car.location,
        maxDistance: CAMPER_BUMPER_TEST.radius,
      });
      const rise = standIn ? standIn.location.y - car.location.y : Number.NaN;
      return {
        pass:
          laid === ROOM_CELL_COUNT - 1 &&
          kept === 2 &&
          left === 0 &&
          Math.abs(rise - 1) <= CAMPER_BUMPER_TEST.parkedTolerance,
        detail: `laid=${laid} kept=${kept} plantsLeft=${left} rise=${rise.toFixed(3)}`,
      };
    });
  } finally {
    a.dim.runCommand(`fill 103 ${ground} 73 114 ${ground} 84 stone`);
  }
}

export function camperAccel(a: Arena): Promise<Outcome> {
  return withCamper(a, 5.5, 85.5, -90, async (car) => {
    drive(car, 0, 1);
    const reach = await ticksToReach(
      car,
      0.95,
      CAMPER_SPEC.maxSpeed,
      200,
      () => car.location.x > 100,
    );
    return { pass: reach >= 60 && reach <= 90, detail: `reach95=${reach}` };
  });
}

// The wall is one block thick, thinner than the 1.3-block top-speed move.
// The guard samples every block the front crosses each tick, so it stops the
// camper here whatever phase the front reaches the wall in (ADR 0067).
export async function camperWall(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill 60 ${a.gy} 82 60 ${a.gy + 3} 89 stone`);
  try {
    return await withCamper(a, 30.5, 85.5, -90, async (car) => {
      drive(car, 0, 1);
      let front = car.location.x + CAMPER_SPEC.bodyFront;
      for (let t = 0; t < 150; t++) {
        await wait(1);
        front = Math.max(front, car.location.x + CAMPER_SPEC.bodyFront);
      }
      const x = car.location.x;
      const speed = length(car.getVelocity());
      return {
        pass: front <= 60.05 && x > 50 && speed < 0.05,
        detail: `front=${front.toFixed(3)} x=${x.toFixed(3)} speed=${speed.toFixed(3)}`,
      };
    });
  } finally {
    a.dim.runCommand(`fill 60 ${a.gy} 82 60 ${a.gy + 3} 89 air`);
  }
}

export function camperPark(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const laid = laidRoomCells(a, car);
    return { pass: laid === ROOM_CELL_COUNT, detail: `laid=${laid}` };
  });
}

// Pressing a level sets the spawn point to its own aisle cell on the floor, never a room
// block; sleeping itself needs a player, so it stays a manual row (ADR 0133, 0182).
export function camperBunkCells(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const typeAt = (c: { x: number; y: number; z: number }) =>
      a.dim.getBlock(c)?.typeId;
    const levels = [
      { layer: 1, block: CAMPER_BED_BLOCK, aisleZ: -2 },
      { layer: 2, block: CAMPER_BUNK_BLOCK, aisleZ: -3 },
    ];
    const ok = levels.every(({ layer, block, aisleZ }) =>
      [-2, -3].every((z) => {
        const cell = localCellAt(pose, { x: 1, z, layer });
        const spawn = bedSpawnCell(pose, cell);
        const aisle = localCellAt(pose, { x: 0, z: aisleZ, layer: 1 });
        return (
          typeAt(cell) === block &&
          spawn !== undefined &&
          spawn.x === aisle.x &&
          spawn.y === aisle.y &&
          spawn.z === aisle.z &&
          typeAt(spawn) === AIR_BLOCK
        );
      }),
    );
    return { pass: ok, detail: `ok=${ok}` };
  });
}

export function camperParkBlocked(a: Arena): Promise<Outcome> {
  const pose = parkSpotPose(a);
  const wall = roomCells(pose, false).find((c) => c.block.type === "wall");
  if (!wall) throw new Error("room has no wall");
  a.dim.runCommand(`setblock ${wall.x} ${wall.y} ${wall.z} stone`);
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const laid = laidRoomCells(a, car);
    const type = a.dim.getBlock(wall)?.typeId;
    return {
      pass: laid === 0 && type === "minecraft:stone",
      detail: `laid=${laid} wall=${type}`,
    };
  });
}

export function camperParkSnow(a: Arena): Promise<Outcome> {
  const pose = parkSpotPose(a);
  const distance = (c: Vec3) =>
    Math.hypot(c.x + 0.5 - pose.x, c.z + 0.5 - pose.z);
  const corners = roomCells(pose, false)
    .filter((c) => c.block.type === "floor")
    .sort((a, b) => distance(b) - distance(a))
    .slice(0, 4);
  for (const c of corners)
    a.dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} snow_layer`);
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const laid = laidRoomCells(a, car);
    const floors = corners.filter(
      (c) => a.dim.getBlock(c)?.typeId === CAMPER_FLOOR_BLOCK,
    ).length;
    return {
      pass: laid === ROOM_CELL_COUNT && floors === 4,
      detail: `laid=${laid} snowReplaced=${floors}`,
    };
  });
}

export async function camperParkPath(a: Arena): Promise<Outcome> {
  const ground = a.gy - 1;
  a.dim.runCommand(`fill 103 ${ground} 73 114 ${ground} 84 grass_path`);
  try {
    return await atParkSpot(a, async (car) => {
      await wait(DOCK.ticks + 10);
      const laid = laidRoomCells(a, car);
      // A path under a full block turns into dirt, so the ground is only logged.
      const under = a.dim.getBlock({ x: 108, y: ground, z: 78 })?.typeId;
      return {
        pass: laid === ROOM_CELL_COUNT && car.location.y === a.gy,
        detail: `laid=${laid} y=${car.location.y} ground=${under}`,
      };
    });
  } finally {
    a.dim.runCommand(`fill 103 ${ground} 73 114 ${ground} 84 stone`);
  }
}

export function camperDepart(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const cells = roomCells(pose, false);
    const parked = countLaid(a, cells);
    drive(car, 0, 1);
    await wait(15);
    const remaining = countLaid(a, cells);
    const moved = movedFrom(car, pose);
    return {
      pass: parked === ROOM_CELL_COUNT && remaining === 0 && moved >= 0.1,
      detail: `parked=${parked} remaining=${remaining} moved=${moved.toFixed(3)}`,
    };
  });
}

export function camperDepartCargo(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const cargo = cargoCells(pose)[0];
    if (!cargo) throw new Error("room has no cargo cells");
    a.dim.runCommand(`setblock ${cargo.x} ${cargo.y} ${cargo.z} stone`);
    drive(car, 0, 1);
    await wait(20);
    const laid = laidRoomCells(a, car);
    const moved = movedFrom(car, pose);
    return {
      pass: laid === ROOM_CELL_COUNT && moved < 0.01,
      detail: `laid=${laid} moved=${moved.toFixed(3)}`,
    };
  });
}

type ShowerToiletCell = DockCell & {
  readonly block: Extract<DockBlock, { type: "showerToilet" }>;
};

function isShowerToiletCell(c: DockCell): c is ShowerToiletCell {
  return c.block.type === "showerToilet";
}

// The shower-toilet block counts only with its plate toward the aisle (ADR 0098). The shower
// door opens only on a player's press, which a test cannot make, so this checks that the rear
// wall behind it is plain wall while it is shut and that BDS loaded the block laid there while
// it is open, on every face (ADR 0118).
export function camperShowerToiletBlock(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const cells = roomCells(pose, false).filter(isShowerToiletCell);
    const laid = cells.filter((c) => {
      const block = a.dim.getBlock(c);
      return (
        block?.typeId === CAMPER_SHOWER_TOILET_BLOCK &&
        block.permutation.getAllStates()[ROOM_FACE_STATE] === c.block.face
      );
    }).length;
    const shut = roomCells(pose, false);
    const behindDoor = roomCells(pose, false, undefined, true).filter(
      (c, i) => c.block.type === "showerDoor" && shut[i]?.block.type === "wall",
    );
    const walls = behindDoor.filter(
      (c) => a.dim.getBlock(c)?.typeId === CAMPER_WALL_BLOCK,
    ).length;
    drive(car, 0, 1);
    await wait(15);
    const cleared = cells.filter(
      (c) => a.dim.getBlock(c)?.typeId === "minecraft:air",
    ).length;
    // Inside the park spot, which atParkSpot fills with air afterwards.
    const spot = { x: 108, y: a.gy + 2, z: 78 };
    let resolved = 0;
    for (const face of [0, 1, 2, 3]) {
      a.dim.getBlock(spot)?.setPermutation(
        BlockPermutation.resolve(CAMPER_SHOWER_DOOR_BLOCK, {
          [ROOM_FACE_STATE]: face,
        }),
      );
      const block = a.dim.getBlock(spot);
      if (
        block?.typeId === CAMPER_SHOWER_DOOR_BLOCK &&
        block.permutation.getAllStates()[ROOM_FACE_STATE] === face
      )
        resolved++;
    }
    return {
      pass:
        cells.length === 2 &&
        laid === 2 &&
        cleared === 2 &&
        behindDoor.length === 3 &&
        walls === 3 &&
        resolved === 4,
      detail: `cells=${cells.length} laid=${laid} cleared=${cleared} behindDoor=${behindDoor.length} walls=${walls} resolved=${resolved}`,
    };
  });
}

// The table comes first: camperDecor empties it with DECOR.slice(0, 1). The saucepan stands
// on the stove's one burner (ADR 0112).
const DECOR: readonly DecorPlacement[] = [
  { slot: "table", item: "potted_plant" },
  { slot: "dashboard_center", item: "transistor_radio" },
  { slot: "stove", item: "saucepan" },
];

// A decor block counts only with its item's block, the yaw quarter, the slot height, and the
// spot; a pair block with the item at each end instead of the spot (ADR 0108).
function laidDecor(
  a: Arena,
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): number {
  return decorCells(pose, decor).filter((c) => {
    const block = a.dim.getBlock(c);
    const states = block?.permutation.getAllStates();
    if (
      block?.typeId !== laidTypeOf(c.block) ||
      states?.[DECOR_FACE_STATE] !== c.block.face
    )
      return false;
    if (c.block.type === "decor")
      return (
        states[DECOR_HEIGHT_STATE] === c.block.height &&
        states[DECOR_SPOT_STATE] === c.block.spot
      );
    const ends = {
      ...pairHeightStates(c.block.pair, c.block.height),
      ...pairEndStates(0, c.block.end0),
      ...pairEndStates(1, c.block.end1),
    };
    return Object.entries(ends).every(([name, v]) => states[name] === v);
  }).length;
}

// A furniture block counts only at its slot height (ADR 0097).
function laidFurniture(
  a: Arena,
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): number {
  return furnitureCells(pose, decor).filter((c) => {
    const block = a.dim.getBlock(c);
    return (
      block?.typeId === CAMPER_FURNITURE_BLOCK &&
      block.permutation.getAllStates()[DECOR_HEIGHT_STATE] === c.block.height
    );
  }).length;
}

export function camperDecor(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    for (const d of DECOR) setDecor(car, d.slot, d.item);
    await wait(3);
    const laid = laidDecor(a, pose, DECOR);
    const furniture = laidFurniture(a, pose, DECOR);
    setDecor(car, "table", undefined);
    await wait(3);
    const kept = laidDecor(a, pose, DECOR.slice(1));
    const table = decorCells(pose, DECOR.slice(0, 1))[0];
    if (!table) throw new Error("camper has no table slot");
    const emptied = a.dim.getBlock(table)?.typeId;
    drive(car, 0, 1);
    await wait(15);
    const remaining = laidDecor(a, pose, DECOR.slice(1));
    const furnitureLeft = furnitureCells(pose, []).filter(
      (c) => a.dim.getBlock(c)?.typeId === CAMPER_FURNITURE_BLOCK,
    ).length;
    const moved = movedFrom(car, pose);
    return {
      pass:
        laid === 3 &&
        furniture === 5 &&
        kept === 2 &&
        emptied === CAMPER_FURNITURE_BLOCK &&
        remaining === 0 &&
        furnitureLeft === 0 &&
        moved >= 0.1,
      detail: `laid=${laid} furniture=${furniture} kept=${kept} emptied=${emptied} remaining=${remaining} furnitureLeft=${furnitureLeft} moved=${moved.toFixed(3)}`,
    };
  });
}

// Both ends of the table: its cell lays one pair block that draws its two items (ADR 0108).
// The shelf boards' pair blocks left with the shelf (ADR 0123).
const PAIRED_DECOR: readonly DecorPlacement[] = [
  { slot: "table", item: "fruit_bowl" },
  { slot: "table_aisle", item: "mug_pair" },
];

export function camperDecorPairs(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    for (const d of PAIRED_DECOR) setDecor(car, d.slot, d.item);
    await wait(3);
    const blocks = decorCells(pose, PAIRED_DECOR).length;
    const laid = laidDecor(a, pose, PAIRED_DECOR);
    // Emptying one end keeps the pair block with the other end's item.
    setDecor(car, "table_aisle", undefined);
    await wait(3);
    const oneEnd = PAIRED_DECOR.filter(({ slot }) => slot !== "table_aisle");
    const kept = laidDecor(a, pose, oneEnd);
    for (const d of oneEnd) setDecor(car, d.slot, undefined);
    await wait(3);
    const furniture = laidFurniture(a, pose, []);
    drive(car, 0, 1);
    await wait(15);
    const moved = movedFrom(car, pose);
    return {
      pass:
        blocks === 1 &&
        laid === 1 &&
        kept === 1 &&
        furniture === furnitureCells(pose, []).length &&
        moved >= 0.1,
      detail: `blocks=${blocks} laid=${laid} kept=${kept} furniture=${furniture} moved=${moved.toFixed(3)}`,
    };
  });
}

type StorageUnit = (typeof CAMPER_STORAGE)[number];

/** What a storage scenario checks beyond the shared shut-and-open round (ADR 0114, 0121). */
interface StorageCase {
  readonly unit: StorageUnit;
  /** One item behind each door. */
  readonly decor: readonly DecorPlacement[];
  /** The block a shut door's plate cell holds. */
  readonly shutPlate: string;
  readonly plateBlock: string;
  /** The plate block's states to resolve, beside each face. */
  readonly plateStates: readonly Record<string, boolean>[];
}

// One item behind each door of a storage unit. The doors open only on a player's press, which
// a test cannot make, so this checks the shut compartments the room lays and what the shut
// doors' plate cells hold, then that BDS loaded the open compartment and the door plate in
// every state (ADR 0114, 0121).
function camperStorage(a: Arena, c: StorageCase): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    for (const d of c.decor) setDecor(car, d.slot, d.item);
    await wait(3);
    const compartmentId = pairDecorBlockId(c.unit.pairKind);
    const compartments = compartmentCells(
      pose,
      c.decor,
      new Set(),
      storageDoors([c.unit]),
    );
    const heightOf = (block: (typeof compartments)[number]["block"]) =>
      "height" in block ? pairHeightStates(c.unit.pairKind, block.height) : {};
    const laid = compartments.filter((cell) => {
      const block = a.dim.getBlock(cell);
      const states = block?.permutation.getAllStates();
      const want = {
        [DECOR_FACE_STATE]: cell.block.face,
        [ROOM_OPEN_STATE]: false,
        ...heightOf(cell.block),
        ...pairEndStates(0, cell.block.end0),
        ...pairEndStates(1, cell.block.end1),
      };
      return (
        block?.typeId === compartmentId &&
        Object.entries(want).every(([name, v]) => states?.[name] === v)
      );
    }).length;
    const shutPlates = c.unit.doors.filter(
      ({ plate }) =>
        a.dim.getBlock(localCellAt(pose, plate))?.typeId === c.shutPlate,
    ).length;
    drive(car, 0, 1);
    await wait(15);
    const cleared = compartments.filter(
      (cell) => a.dim.getBlock(cell)?.isAir,
    ).length;
    // Inside the park spot, which atParkSpot fills with air afterwards.
    const spot = { x: 108, y: a.gy + 2, z: 78 };
    const resolved: string[] = [];
    const set = (
      at: { x: number; y: number; z: number },
      typeId: string,
      states: Record<string, string | number | boolean>,
    ) => {
      a.dim
        .getBlock(at)
        ?.setPermutation(BlockPermutation.resolve(typeId, states));
      const block = a.dim.getBlock(at);
      const got = block?.permutation.getAllStates();
      if (
        block?.typeId === typeId &&
        Object.entries(states).every(([name, v]) => got?.[name] === v)
      )
        resolved.push(typeId);
    };
    const opened = compartments.map(({ block }) => heightOf(block));
    for (const face of [0, 1, 2, 3]) {
      for (const states of c.plateStates)
        set(spot, c.plateBlock, { [ROOM_FACE_STATE]: face, ...states });
      for (const height of opened)
        set({ ...spot, y: spot.y + 1 }, compartmentId, {
          [DECOR_FACE_STATE]: face,
          [ROOM_OPEN_STATE]: true,
          ...height,
          ...pairEndStates(0, "cushion"),
          ...pairEndStates(1, "desk_fan"),
        });
    }
    const doors = c.unit.doors.length;
    const moved = movedFrom(car, pose);
    return {
      pass:
        compartments.length === doors &&
        laid === doors &&
        shutPlates === doors &&
        cleared === doors &&
        resolved.length === 4 * (c.plateStates.length + doors) &&
        moved >= 0.1,
      detail: `compartments=${compartments.length} laid=${laid} shutPlates=${shutPlates} cleared=${cleared} resolved=${resolved.length} moved=${moved.toFixed(3)}`,
    };
  });
}

// The wall cabinet's shut doors' plate cells hold the ceiling (ADR 0114).
export function camperCabinet(a: Arena): Promise<Outcome> {
  return camperStorage(a, {
    unit: WALL_CABINET,
    decor: [
      { slot: "cabinet_sink_rear", item: "toaster" },
      { slot: "cabinet_stove_front", item: "mug_pair" },
    ],
    shutPlate: CAMPER_CEILING_BLOCK,
    plateBlock: CAMPER_CABINET_DOOR_BLOCK,
    plateStates: [{}],
  });
}

// The fridge's shut doors' plate cells in the aisle hold air with the lights off, and each
// plate resolves lit and unlit (ADR 0115, 0123).
export function camperFridge(a: Arena): Promise<Outcome> {
  return camperStorage(a, {
    unit: FRIDGE,
    decor: [
      { slot: "fridge_bottom_rear", item: "toaster" },
      { slot: "fridge_top_front", item: "mug_pair" },
    ],
    shutPlate: AIR_BLOCK,
    plateBlock: CAMPER_FRIDGE_DOOR_BLOCK,
    plateStates: [{ [ROOM_LIT_STATE]: false }, { [ROOM_LIT_STATE]: true }],
  });
}

export function camperRelay(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    setDecor(car, "table", "potted_plant");
    await wait(3);
    const room = roomCells(pose, false);
    const floor = room.find((c) => c.block.type === "floor");
    if (!floor) throw new Error("room has no floor");
    const wall = room.find((c) => c.block.type === "wall");
    if (!wall) throw new Error("room has no wall");
    const decor = decorCells(pose, [
      { slot: "table", item: "potted_plant" },
    ])[0];
    if (!decor) throw new Error("camper has no table slot");
    const lost = [floor, wall, decor];
    const before = countLaid(a, lost);
    for (const c of lost) a.dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} air`);
    const emptied = countLaid(a, lost);
    let ticks = 0;
    while (countLaid(a, lost) !== lost.length && ticks < CAMPER_RELAY_TICKS) {
      await wait(1);
      ticks++;
    }
    const relaid = countLaid(a, lost);
    return {
      pass: before === lost.length && emptied === 0 && relaid === lost.length,
      detail: `before=${before} emptied=${emptied} relaid=${relaid} ticks=${ticks}`,
    };
  });
}

export function camperTakeoff(a: Arena): Promise<Outcome> {
  return withCamper(a, FLIGHT_PATH.x, FLIGHT_PATH.z, -90, async (car) => {
    await takeOff(car, CAMPER_SPEC.takeoffTicks);
    return takeoffOutcome(a, car);
  });
}

export function camperLand(a: Arena): Promise<Outcome> {
  return withCamper(a, FLIGHT_PATH.x, FLIGHT_PATH.z, -90, async (car) => {
    await takeOff(car, CAMPER_SPEC.takeoffTicks);
    return gearDownLandingOutcome(a, car, CAMPER_SPEC.gearDownHeight);
  });
}

// The camper dive tank: glass walls from a.gy to a.gy + 6 around water up to a.gy + 5,
// so the water's top is a.gy + 6 and the rim's top is a.gy + 7.
const CAMPER_TANK = {
  waterTop: 6,
  rimTop: 7, // the top face of the glass layer at a.gy + waterTop
  // Hover climbs at the SUV's rate, which flight_climb_descend shows rises at
  // least 2.5 blocks in 20 ticks of held Jump, so 20 ticks clear the rim by 1.
  climbTicks: 20,
  rimClearance: 1,
} as const;

export async function camperDive(a: Arena): Promise<Outcome> {
  // The flat world's four-block ground cannot hold a pool deep enough for the camper.
  try {
    const rim = a.gy + CAMPER_TANK.waterTop;
    a.dim.runCommand(`fill 100 ${a.gy} 61 118 ${rim} 69 glass`);
    a.dim.runCommand(`fill 101 ${a.gy} 62 117 ${rim - 1} 68 water`);
    // The glass fill also roofed the tank; open its top layer so the camper can surface.
    a.dim.runCommand(`fill 101 ${rim} 62 117 ${rim} 68 air`);
    return await withCamper(a, 109.5, 65.5, -90, async (car) => {
      const enteredAt = await ticksUntilForm(car, "submarine", 40);
      drive(car, 0, 0, true);
      const hoverAt = await ticksUntilForm(car, "hover", 80);
      // Hover needs dry feet, so its first tick already sits at the water's top;
      // only the climb after it shows the camper leaves the tank.
      let peak = car.location.y - a.gy;
      for (let t = 0; hoverAt >= 0 && t < CAMPER_TANK.climbTicks; t++) {
        await wait(1);
        peak = Math.max(peak, car.location.y - a.gy);
      }
      return {
        pass:
          enteredAt >= 0 &&
          hoverAt >= 0 &&
          peak >= CAMPER_TANK.rimTop + CAMPER_TANK.rimClearance,
        detail: `enteredAt=${enteredAt} hoverAt=${hoverAt} peak=${peak.toFixed(2)} aboveWater=${(peak - CAMPER_TANK.waterTop).toFixed(2)}`,
      };
    });
  } finally {
    a.dim.runCommand(
      `fill 100 ${a.gy} 61 118 ${a.gy + CAMPER_TANK.waterTop} 69 air`,
    );
  }
}

export function camperToiletSeat(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const seatsWithin = (maxDistance: number) =>
      a.dim.getEntities({
        type: DECK_SEAT_TYPE,
        location: pose,
        maxDistance,
      });
    const seats = seatsWithin(CAMPER_DECK_SEATS_TEST.radius);
    const unmatched = [...seats];
    const positioned = deckSeats(pose).every((at) => {
      const index = unmatched.findIndex(
        (seat) =>
          Math.hypot(
            seat.location.x - at.x,
            seat.location.y - at.y,
            seat.location.z - at.z,
          ) <= CAMPER_DECK_SEATS_TEST.tolerance,
      );
      if (index < 0) return false;
      unmatched.splice(index, 1);
      return true;
    });
    drive(car, 0, 1);
    let remaining = seatsWithin(CAMPER_DECK_SEATS_TEST.clearRadius).length;
    let clearTicks = 0;
    while (remaining > 0 && clearTicks < CAMPER_DECK_SEATS_TEST.clearTicks) {
      await wait(1);
      clearTicks++;
      remaining = seatsWithin(CAMPER_DECK_SEATS_TEST.clearRadius).length;
    }
    return {
      pass:
        seats.length === CAMPER_DECK_SEATS_TEST.count &&
        positioned &&
        remaining === 0,
      detail: `seats=${seats.length} positioned=${positioned} clearTicks=${clearTicks} remaining=${remaining}`,
    };
  });
}

// ADR 0109: a rider who stands up from a deck seat is put on the floor of an aisle
// cell; no simulated player is available, so this checks that every stand spot
// lands on a laid floor block with open feet and head cells.
export function camperStandSpots(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    await wait(DOCK.ticks + 10);
    const pose = carPose(car);
    const wrong = deckSeats(pose).filter(({ stand }) => {
      if (!stand) return true;
      const feet = {
        x: Math.floor(stand.x),
        y: Math.floor(stand.y),
        z: Math.floor(stand.z),
      };
      return (
        a.dim.getBlock({ ...feet, y: feet.y - 1 })?.typeId !==
          CAMPER_FLOOR_BLOCK ||
        a.dim.getBlock(feet)?.isAir !== true ||
        a.dim.getBlock({ ...feet, y: feet.y + 1 })?.isAir !== true
      );
    }).length;
    return {
      pass: wrong === 0,
      detail: `wrong=${wrong}`,
    };
  });
}

// ADR 0116: one bumper stand-in follows the camper, its row of boxes across the heading,
// and goes with it. Taps from a phone cannot be simulated, so the forwarding of hits and
// interactions is left to the unit tests and the phone check.
export function camperBumper(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    const near = () =>
      a.dim.getEntities({
        families: [STAND_IN_FAMILY],
        location: car.isValid ? car.location : parkSpotPose(a),
        maxDistance: CAMPER_BUMPER_TEST.radius,
      });
    const offFront = (standIn: Entity) => {
      const f = forward(car.getRotation().y);
      return Math.hypot(
        standIn.location.x - (car.location.x + f.x * CAMPER_SPEC.bodyFront),
        standIn.location.y - car.location.y,
        standIn.location.z - (car.location.z + f.z * CAMPER_SPEC.bodyFront),
      );
    };
    await wait(DOCK.ticks + 10);
    const parked = near();
    const [standIn] = parked;
    // Facing -x, the bumper's row runs along z. The id links between the two are
    // dynamic properties of the main pack, which this pack cannot read.
    const parkedOk =
      parked.length === 1 &&
      standIn !== undefined &&
      CAMPER_PROFILE.standIn !== undefined &&
      standIn.typeId === standInType(CAMPER_PROFILE.standIn.name, "z") &&
      offFront(standIn) <= CAMPER_BUMPER_TEST.parkedTolerance;
    drive(car, 0, 1);
    await wait(CAMPER_BUMPER_TEST.driveTicks);
    const driving = near();
    const drivingOk =
      driving.length === 1 &&
      driving[0] !== undefined &&
      offFront(driving[0]) <= CAMPER_BUMPER_TEST.drivingTolerance;
    const off = driving[0] ? offFront(driving[0]).toFixed(3) : "none";
    car.remove();
    await wait(CAMPER_BUMPER_TEST.clearTicks);
    const left = near().length;
    return {
      pass: parkedOk && drivingOk && left === 0,
      detail: `parked=${parked.length} parkedOk=${parkedOk} driving=${driving.length} off=${off} left=${left}`,
    };
  });
}
