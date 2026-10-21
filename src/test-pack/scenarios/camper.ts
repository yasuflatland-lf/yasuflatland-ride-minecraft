import type { Entity } from "@minecraft/server";
import { length, type Vec3 } from "../../domain/shared/vec";
import type { DecorPlacement } from "../../domain/vehicle/dock/decor";
import type {
  DockBlock,
  DockCell,
  HoldPose,
} from "../../domain/vehicle/dock/floor";
import {
  cargoCells,
  deckSeats,
  decorCells,
  furnitureCells,
  parkPose,
  roomCells,
} from "../../domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../domain/vehicle/kinds/camper/spec";
import { DOCK } from "../../domain/vehicle/motion/dock";
import { DOCK_RECHECK_TICKS } from "../../infrastructure/vehicle/bedrock/dockBlocks";
import {
  CAMPER_BED_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_WALL_BLOCK,
  DECK_FLOOR_BLOCK,
  DECK_SEAT_TYPE,
  DECOR_FACE_STATE,
  DECOR_HEIGHT_STATE,
  decorBlockId,
  ROOM_FACE_STATE,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import {
  type Arena,
  drive,
  type Outcome,
  setDecor,
  wait,
  withCamper,
} from "../arena";
import {
  FLIGHT_LANE,
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

// Test bound, not an ADR value: a lost cell is laid again on the next check,
// at most DOCK_RECHECK_TICKS lays later; twice that allows for a slow tick.
const CAMPER_RELAY_TICKS = DOCK_RECHECK_TICKS * 2;

const ROOM_BLOCK: Readonly<
  Record<Exclude<DockBlock["type"], "decor">, string>
> = {
  deck: DECK_FLOOR_BLOCK,
  floor: CAMPER_FLOOR_BLOCK,
  ceiling: CAMPER_CEILING_BLOCK,
  wall: CAMPER_WALL_BLOCK,
  door: CAMPER_DOOR_BLOCK,
  bed: CAMPER_BED_BLOCK,
  furniture: CAMPER_FURNITURE_BLOCK,
  showerToilet: CAMPER_SHOWER_TOILET_BLOCK,
};

function laidTypeOf(block: DockBlock): string {
  return block.type === "decor"
    ? decorBlockId(block.item)
    : ROOM_BLOCK[block.type];
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
    return { pass: laid === 107, detail: `laid=${laid}` };
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
      pass: laid === 107 && floors === 4,
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
        pass: laid === 107 && car.location.y === a.gy,
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
      pass: parked === 107 && remaining === 0 && moved >= 0.1,
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
      pass: laid === 107 && moved < 0.01,
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

// The shower-toilet block counts only with its plate toward the aisle (ADR 0098).
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
    drive(car, 0, 1);
    await wait(15);
    const cleared = cells.filter(
      (c) => a.dim.getBlock(c)?.typeId === "minecraft:air",
    ).length;
    return {
      pass: cells.length === 2 && laid === 2 && cleared === 2,
      detail: `cells=${cells.length} laid=${laid} cleared=${cleared}`,
    };
  });
}

const DECOR: readonly DecorPlacement[] = [
  { slot: "table", item: "potted_plant" },
  { slot: "dashboard_center", item: "transistor_radio" },
];

// A decor block counts only with its item's block, the yaw quarter, and the slot height.
function laidDecor(
  a: Arena,
  pose: HoldPose,
  decor: readonly DecorPlacement[],
): number {
  return decorCells(pose, decor).filter((c) => {
    const block = a.dim.getBlock(c);
    const states = block?.permutation.getAllStates();
    return (
      block?.typeId === decorBlockId(c.block.item) &&
      states?.[DECOR_FACE_STATE] === c.block.face &&
      states?.[DECOR_HEIGHT_STATE] === c.block.height
    );
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
        laid === 2 &&
        furniture === 10 &&
        kept === 1 &&
        emptied === CAMPER_FURNITURE_BLOCK &&
        remaining === 0 &&
        furnitureLeft === 0 &&
        moved >= 0.1,
      detail: `laid=${laid} furniture=${furniture} kept=${kept} emptied=${emptied} remaining=${remaining} furnitureLeft=${furnitureLeft} moved=${moved.toFixed(3)}`,
    };
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
  return withCamper(a, FLIGHT_LANE.x, FLIGHT_LANE.z, -90, async (car) => {
    await takeOff(car, CAMPER_SPEC.takeoffTicks);
    return takeoffOutcome(a, car);
  });
}

export function camperLand(a: Arena): Promise<Outcome> {
  return withCamper(a, FLIGHT_LANE.x, FLIGHT_LANE.z, -90, async (car) => {
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
