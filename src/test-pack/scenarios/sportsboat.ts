import { type Entity, type Player, system } from "@minecraft/server";
import { asPlayerId, asVehicleId } from "../../domain/shared/ids";
import { dot, forward, length, type Vec3 } from "../../domain/shared/vec";
import { rebuildVehicle } from "../../domain/vehicle/kinds/index";
import { SportsboatDrive } from "../../domain/vehicle/kinds/sportsboat/drive";
import {
  SPORTSBOAT_MOTION,
  SPORTSBOAT_PROFILE,
} from "../../domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../domain/vehicle/kinds/sportsboat/spec";
import {
  nearestSeat,
  seatWorldPositions,
  toLocal,
} from "../../domain/vehicle/seats";
import { id } from "../../infrastructure/shared/identifiers";
import {
  DECK_FLOOR_BLOCK,
  DECK_SEAT_TYPE,
  entityPropertyId,
  SEAT_FILLER_TYPE,
  TEST_HELD_ITEM_EVENT,
  TEST_TOOL_EVENT,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import { SeatFillers } from "../../infrastructure/vehicle/bedrock/seatFillers";
import {
  type Arena,
  BOAT_SEAT_PROBE,
  clearInput,
  drive,
  POOL,
  wait,
  withBoat,
  withPool,
} from "../arena";
import { type Outcome, runCourse, type StepSink } from "../outcome";
import { settledAt } from "../settle";
import { summonCow } from "./shared";

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Along +z at x = 20.5 the pool is clear for a full throttle and coast;
// wall_diagonal's wall stands at x = 45.
const POOL_SOUTH_STRIP = { x: POOL.minX + 5.5, z: POOL.minZ + 2.5, yaw: 0 };

export function boatFloat(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(
      a,
      async (boat) => {
        // Any input, even a centered stick, keeps the boat from docking, so the
        // engine floats it here instead of the hold pose (ADR 0063).
        drive(boat, 0, 0);
        await wait(40); // Let the boat settle on the water
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        let docked = false;
        for (let t = 0; t < 60; t++) {
          await wait(1);
          minY = Math.min(minY, boat.location.y);
          maxY = Math.max(maxY, boat.location.y);
          docked ||= boat.getProperty(entityPropertyId("docked")) === true;
        }
        const bob = maxY - minY;
        const minDraft = a.gy - maxY;
        const maxDraft = a.gy - minY;
        return {
          pass: !docked && bob <= 0.3 && minDraft >= 0.3 && maxDraft <= 0.6,
          detail: `docked=${docked} bob=${bob.toFixed(3)} draft=${minDraft.toFixed(3)}-${maxDraft.toFixed(3)}`,
        };
      },
      undefined,
      0,
    ),
  );
}

export function boatLava(a: Arena): Promise<Outcome> {
  return withPool(
    a,
    3,
    () =>
      withBoat(
        a,
        async (boat) => {
          drive(boat, 0, 1);
          const start = boat.location;
          await wait(60);
          const moved = boat.location.z - start.z;
          const draft = a.gy - boat.location.y;
          return {
            pass: boat.isValid && moved > 5 && draft >= 0 && draft < 1,
            detail: `moved=${moved.toFixed(2)} draft=${draft.toFixed(2)} valid=${boat.isValid}`,
          };
        },
        POOL_SOUTH_STRIP,
        20,
      ),
    "lava",
  );
}

// Acceptance bounds from issue #198, not ADR 0063 (which sets only when a boat
// docks and undocks): a docked boat holds still for 2 s, undocks within 0.5 s
// of input, and leaves within 2 s.
const BOAT_DOCK_TEST = {
  timeout: 120,
  holdTicks: 40,
  heightTolerance: 0.02,
  floorRadius: 3,
  minDeckCells: 8,
  undockTicks: 10,
  clearRadius: 4,
  departureTicks: 40,
  minDeparture: 1,
} as const;

// Test bounds, not values from ADR 0063: the four seats lie within 0.9 blocks
// of the boat, so a 4-block search finds them all; 0.1 allows for the seat
// teleport tolerance; departure must clear every seat within the orphan-check
// radius of deckSeats.ts within half a second.
const BOAT_DECK_SEATS_TEST = {
  count: 4,
  radius: 4,
  tolerance: 0.1,
  clearRadius: 6,
  clearTicks: 10,
} as const;

function deckFloorCount(a: Arena, center: Vec3, radius: number): number {
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const cz = Math.floor(center.z);
  let count = 0;
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (
      let y = Math.max(a.dim.heightRange.min, cy - radius);
      y <= cy + radius;
      y++
    ) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        if (a.dim.getBlock({ x, y, z })?.typeId === DECK_FLOOR_BLOCK) count++;
      }
    }
  }
  return count;
}

export function boatDock(a: Arena, onStep: StepSink): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(
      a,
      async (boat) => {
        const docked = () =>
          boat.getProperty(entityPropertyId("docked")) === true;
        let start = boat.location;
        const seatsWithin = (maxDistance: number) =>
          a.dim.getEntities({
            type: DECK_SEAT_TYPE,
            location: start,
            maxDistance,
          });
        return runCourse(
          [
            {
              name: "dock",
              run: async () => {
                let dockTicks = 0;
                while (!docked() && dockTicks < BOAT_DOCK_TEST.timeout) {
                  await wait(1);
                  dockTicks++;
                }
                if (!docked())
                  return {
                    pass: false,
                    detail: `not docked after ${dockTicks} ticks`,
                  };
                start = boat.location;
                let maxHeightError = 0;
                let held = true;
                for (let tick = 0; tick < BOAT_DOCK_TEST.holdTicks; tick++) {
                  await wait(1);
                  maxHeightError = Math.max(
                    maxHeightError,
                    Math.abs(boat.location.y - start.y),
                  );
                  held &&= docked();
                }
                const floorCount = deckFloorCount(
                  a,
                  start,
                  BOAT_DOCK_TEST.floorRadius,
                );
                return {
                  pass:
                    held &&
                    maxHeightError <= BOAT_DOCK_TEST.heightTolerance &&
                    floorCount >= BOAT_DOCK_TEST.minDeckCells,
                  detail: `dockTicks=${dockTicks} held=${held} heightError=${maxHeightError.toFixed(3)} floor=${floorCount}`,
                };
              },
            },
            {
              name: "deck_seats",
              run: async () => {
                const seats = seatsWithin(BOAT_DECK_SEATS_TEST.radius);
                const expected = seatWorldPositions(
                  { ...start, yaw: boat.getRotation().y },
                  SPORTSBOAT_PROFILE.seats.positions,
                );
                const unmatched = [...seats];
                const positioned = expected.every((at) => {
                  const index = unmatched.findIndex(
                    (seat) =>
                      Math.hypot(
                        seat.location.x - at.x,
                        seat.location.y - at.y,
                        seat.location.z - at.z,
                      ) <= BOAT_DECK_SEATS_TEST.tolerance,
                  );
                  if (index < 0) return false;
                  unmatched.splice(index, 1);
                  return true;
                });
                return {
                  pass:
                    seats.length === BOAT_DECK_SEATS_TEST.count && positioned,
                  detail: `seats=${seats.length} positioned=${positioned}`,
                };
              },
            },
            {
              name: "drive_off",
              run: async () => {
                const seatsLeft = () =>
                  seatsWithin(BOAT_DECK_SEATS_TEST.clearRadius).length;
                const f = forward(boat.getRotation().y);
                drive(boat, 0, 1);
                let undockTicks = 0;
                let remainingFloor = deckFloorCount(
                  a,
                  start,
                  BOAT_DOCK_TEST.clearRadius,
                );
                while (
                  (docked() || remainingFloor > 0) &&
                  undockTicks < BOAT_DOCK_TEST.undockTicks
                ) {
                  await wait(1);
                  undockTicks++;
                  remainingFloor = deckFloorCount(
                    a,
                    start,
                    BOAT_DOCK_TEST.clearRadius,
                  );
                }
                const leftDock = !docked();
                let clearTicks = undockTicks;
                while (
                  seatsLeft() > 0 &&
                  clearTicks < BOAT_DECK_SEATS_TEST.clearTicks
                ) {
                  await wait(1);
                  clearTicks++;
                }
                const remainingSeats = seatsLeft();
                let distance = 0;
                for (
                  let tick = clearTicks;
                  tick < BOAT_DOCK_TEST.departureTicks;
                  tick++
                ) {
                  await wait(1);
                  distance =
                    (boat.location.x - start.x) * f.x +
                    (boat.location.z - start.z) * f.z;
                  if (distance >= BOAT_DOCK_TEST.minDeparture) break;
                }
                return {
                  pass:
                    leftDock &&
                    remainingFloor === 0 &&
                    distance >= BOAT_DOCK_TEST.minDeparture &&
                    remainingSeats === 0,
                  detail: `undockTicks=${undockTicks} undocked=${leftDock} remainingFloor=${remainingFloor} forward=${distance.toFixed(3)} clearTicks=${clearTicks} remainingSeats=${remainingSeats}`,
                };
              },
            },
          ],
          { onStep },
        );
      },
      POOL_SOUTH_STRIP,
      0,
    ),
  );
}

function isWater(typeId: string | undefined): boolean {
  return typeId === "minecraft:water" || typeId === "minecraft:flowing_water";
}

function feetInWater(boat: Entity): boolean {
  const { x, y, z } = boat.location;
  const block = boat.dimension.getBlock({
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z),
  });
  return isWater(block?.typeId);
}

export function boatDrag(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(
      a,
      async (boat) => {
        const start = a.local(boat.location);
        let observed = boat.getVelocity();
        const waterRatios: number[] = [];
        const airRatios: number[] = [];
        const steadySpeeds: number[] = [];
        const coastRatios: number[] = [];
        const steadyDrag: number[] = [];
        const replica = new SportsboatDrive(boat.getRotation().y, {});
        const lines: string[] = [];
        drive(boat, 0, 1);
        for (let t = 0; t < 93; t++) {
          // The main pack acts on a script event one tick after it is sent:
          // without this lag the replica's estimate drifted to 0.72 while the
          // boat held 1.11 blocks/tick, which needs about 0.84.
          const throttle = t >= 1 && t <= 80;
          if (t === 80) clearInput(boat);
          const step = replica.step(
            { moveX: 0, moveY: throttle ? 1 : 0, jump: false },
            {
              deckSeatInputs: [],
              tick: t,
              velocity: observed,
              onGround: false,
              // The replica stays afloat for the whole run.
              location: boat.location,
              waterAt: () => true,
              blockTypes: (cells) => cells.map(() => "minecraft:air"),
              solidAt: () => false,
            },
          );
          const given = {
            x: observed.x + step.impulse.x,
            z: observed.z + step.impulse.z,
          };
          const previousSpeed = length(observed);
          // Each row pairs the given velocity at t with the observation at t+1.
          await wait(1);
          observed = boat.getVelocity();
          const speed = length(observed);
          const water = feetInWater(boat);
          const denominator = throttle ? dot(given, given) : previousSpeed;
          const ratio =
            denominator > 0
              ? (throttle ? dot(observed, given) : speed) / denominator
              : undefined;
          if (ratio !== undefined) {
            if (throttle && t >= 5)
              (water ? waterRatios : airRatios).push(ratio);
            if (!throttle) coastRatios.push(ratio);
          }
          if (throttle && t >= 60) {
            steadySpeeds.push(speed);
            const drag = replica.inspect().waterDrag;
            if (drag !== undefined) steadyDrag.push(drag);
          }
          const position = a.local(boat.location);
          lines.push(
            `tick=${t + 1} ${throttle ? "throttle" : "coast"} impulse=${length(step.impulse).toFixed(3)} given=${length(given).toFixed(3)} observed=${speed.toFixed(3)} x=${position.x.toFixed(3)} z=${position.z.toFixed(3)} feet=${(boat.location.y - a.gy).toFixed(3)} water=${water ? 1 : 0} drag=${replica.inspect().waterDrag?.toFixed(3) ?? "n/a"} ratio=${ratio?.toFixed(3) ?? "n/a"}`,
          );
        }
        const meanText = (values: number[]) =>
          values.length > 0 ? mean(values).toFixed(3) : "n/a";
        const summary = (values: number[]) =>
          `mean=${meanText(values)} spread=${values.length > 0 ? (Math.max(...values) - Math.min(...values)).toFixed(3) : "n/a"} n=${values.length}`;
        const end = a.local(boat.location);
        const distance = length({
          x: end.x - start.x,
          z: end.z - start.z,
        });
        return {
          pass: distance >= 5,
          detail: `distance=${distance.toFixed(3)} water(${summary(waterRatios)}) air(${summary(airRatios)}) steadySpeed=${meanText(steadySpeeds)} coastRatio=${meanText(coastRatios)} finalDrag=${replica.inspect().waterDrag?.toFixed(3) ?? "n/a"} steadyDrag=${Math.min(...steadyDrag).toFixed(3)}-${Math.max(...steadyDrag).toFixed(3)}`,
          lines,
        };
      },
      POOL_SOUTH_STRIP,
    ),
  );
}

export function boatCruise(a: Arena): Promise<Outcome> {
  return withPool(a, 3, async () => {
    const steadySpeed = await withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 1);
        const speeds: number[] = [];
        for (let t = 1; t <= 70; t++) {
          await wait(1);
          if (t >= 51) speeds.push(length(boat.getVelocity()));
        }
        return mean(speeds);
      },
      POOL_SOUTH_STRIP,
    );
    const turn = await withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 1);
        const cruiseSpeeds: number[] = [];
        for (let t = 1; t <= 55; t++) {
          await wait(1);
          if (t >= 51) cruiseSpeeds.push(length(boat.getVelocity()));
        }
        const cruiseSpeed = mean(cruiseSpeeds);
        drive(boat, -1, 1);
        let yaw = boat.getRotation().y;
        let degrees = 0;
        let ticks = 0;
        const speeds: number[] = [];
        while (Math.abs(degrees) < 360 && ticks < 120) {
          await wait(1);
          const next = boat.getRotation().y;
          degrees += ((next - yaw + 540) % 360) - 180;
          yaw = next;
          ticks++;
          speeds.push(length(boat.getVelocity()));
        }
        return {
          cruiseSpeed,
          minSpeed: Math.min(...speeds),
          endSpeed: mean(speeds.slice(-5)),
          degrees,
          ticks,
          rate: degrees / ticks,
        };
      },
      // A right turn heads toward -x; this lane clears the pad and diagonal wall.
      { x: 75.5, z: POOL.minZ + 2.5, yaw: 0 },
    );
    return {
      pass:
        steadySpeed >= 0.95 * SPORTSBOAT_MOTION.maxSpeed &&
        Math.abs(turn.degrees) >= 360 &&
        turn.endSpeed >= 0.8 * turn.cruiseSpeed,
      detail: `steadySpeed=${steadySpeed.toFixed(3)} cruiseSpeed=${turn.cruiseSpeed.toFixed(3)} turnMinSpeed=${turn.minSpeed.toFixed(3)} turnEndSpeed=${turn.endSpeed.toFixed(3)} kept=${(turn.endSpeed / turn.cruiseSpeed).toFixed(3)} turn=${turn.degrees.toFixed(1)} turnTicks=${turn.ticks} turnRate=${turn.rate.toFixed(3)}`,
    };
  });
}

export function boatShore(a: Arena): Promise<Outcome> {
  const shoreX = 40;
  return withPool(a, 3, () => {
    a.dim.runCommand(
      `fill ${a.box(shoreX, a.gy - 3, POOL.minZ, POOL.maxX, a.gy - 1, POOL.maxZ)} stone`,
    );
    return withBoat(a, async (boat) => {
      const x0 = a.local(boat.location).x;
      drive(boat, 0, 1);
      const samples: number[] = [];
      for (let tick = 0; tick < 120; tick++) {
        await wait(1);
        const v = boat.getVelocity();
        samples.push(Math.hypot(v.x, v.z));
        if (settledAt(samples, 0.02, 10) !== undefined) break;
      }
      const x = a.local(boat.location).x;
      const feet = boat.location.y - a.gy;
      const speed = length(boat.getVelocity());
      return {
        pass: x - x0 > 10 && x < shoreX && feet < 0 && speed < 0.05,
        detail: `x=${x.toFixed(2)} feet=${feet.toFixed(3)} speed=${speed.toFixed(3)}`,
      };
    });
  });
}

export function boatRam(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(a, async (boat) => {
      const start = a.local(boat.location);
      const spot = { x: start.x + 14, y: start.y, z: start.z };
      const pinAt = a.at(spot.x, spot.y, spot.z);
      const cow = summonCow(a, spot.x, spot.z);
      if (!cow) return { pass: false, detail: "cow not found" };
      // Slowness does not stop a mob in water: its float goal bobs it on a
      // random roll and the hull can push it, which moved the cow out of the ram
      // band (side 1.51, dy -0.5..1.8) in CI. Pin it to the lane at hull height
      // until the first hit.
      const pin = () => {
        if (!cow.isValid) return;
        cow.teleport(pinAt);
        cow.clearVelocity();
      };
      let offset = "n/a";
      try {
        if (cow.getComponent("minecraft:is_baby"))
          return { pass: false, detail: "baby cow" };
        cow.addEffect("slowness", 600, {
          amplifier: 255,
          showParticles: false,
        });
        pin();
        const hp0 = cow.getComponent("minecraft:health")?.currentValue ?? 0;
        const boatHp0 = boat.getComponent("minecraft:health")?.currentValue;
        drive(boat, 0, 1);
        let hp = hp0;
        let hit = false;
        let hitTick = -1;
        for (let t = 0; t < 80 && !hit; t++) {
          await wait(1);
          hp = cow.isValid
            ? (cow.getComponent("minecraft:health")?.currentValue ?? 0)
            : 0;
          hit = hp < hp0;
          if (hit) hitTick = t;
          else pin();
        }
        if (cow.isValid) {
          const ahead = cow.location.x - boat.location.x;
          const side = cow.location.z - boat.location.z;
          const dy = cow.location.y - boat.location.y;
          offset = `${ahead.toFixed(2)},${side.toFixed(2)},${dy.toFixed(2)}`;
        }
        const boatHp = boat.getComponent("minecraft:health")?.currentValue;
        return {
          pass: hp0 > 0 && hit && boatHp0 !== undefined && boatHp === boatHp0,
          detail: `cowHp=${hp0}->${hp} boatHp=${boatHp0}->${boatHp} hitTick=${hitTick} cowOffset=${offset}`,
        };
      } finally {
        if (cow.isValid) cow.remove();
      }
    }),
  );
}

/** The boat seat a rider sits in, judged by position as the main pack judges it (ADR 0019). */
function boatSeatOf(vehicle: Entity, rider: Entity): number {
  const offset = {
    x: rider.location.x - vehicle.location.x,
    z: rider.location.z - vehicle.location.z,
  };
  return nearestSeat(
    toLocal(offset, forward(vehicle.getRotation().y)),
    SPORTSBOAT_PROFILE.seats.positions,
  );
}

// Seat fillers hold the free seats below a chosen one, so the engine, which seats
// riders by their index in its rider list, puts each rider in their seat; and after
// the driver gets out, laying the list again every tick, as the boat does, puts the
// rear rider back in the rear. The engine does not take a rider back in the tick it got
// off, so the rear rider waits a tick for it (ADR 0120). Cows stand in for players on a
// probe with the boat's seats.
export async function boatSeatFillers(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`summon ${BOAT_SEAT_PROBE} ${a.xyz(30.5, a.gy, 8.5)}`);
  const probe = a.dim.getEntities({
    type: BOAT_SEAT_PROBE,
    location: a.at(30.5, a.gy, 8.5),
    maxDistance: 1.5,
  })[0];
  const cows = [0, 1].map((i) => summonCow(a, 27.5 + i * 2, 4.5));
  const fillers = new SeatFillers();
  try {
    const [driver, rear] = cows;
    if (!probe || !driver || !rear)
      return { pass: false, detail: "probe or cows missing" };
    probe.setRotation({ x: 0, y: -90 });
    const vehicleId = asVehicleId(probe.id);
    const cowOf = (id: string) =>
      cows.find((cow) => cow?.id === id) as unknown as Player | undefined;
    const lay = (layout: (Entity | undefined)[]) =>
      fillers.lay(
        vehicleId,
        probe,
        layout.map((cow) => (cow ? asPlayerId(cow.id) : undefined)),
        cowOf,
      );
    // The probe's rider list: D the driver cow, R the rear cow, F a filler.
    const riderList = () =>
      (probe.getComponent("minecraft:rideable")?.getRiders() ?? [])
        .map((rider) =>
          rider.typeId === SEAT_FILLER_TYPE
            ? "F"
            : rider.id === driver.id
              ? "D"
              : rider.id === rear.id
                ? "R"
                : "?",
        )
        .join("");
    lay([driver, undefined, rear]);
    await wait(5);
    const seated = [boatSeatOf(probe, driver), boatSeatOf(probe, rear)];
    const before = riderList();
    probe.getComponent("minecraft:rideable")?.ejectRider(driver);
    await wait(1);
    let waited = 0;
    let backAt = -1;
    for (let t = 0; t < 10; t++) {
      lay([undefined, undefined, rear]);
      if (fillers.waitingRiders(vehicleId).has(asPlayerId(rear.id))) waited++;
      if (backAt < 0 && riderList().includes("R")) backAt = t;
      await wait(1);
    }
    const afterLeave = boatSeatOf(probe, rear);
    const after = riderList();
    lay([]);
    await wait(2);
    const left = a.dim.getEntities({
      type: SEAT_FILLER_TYPE,
      location: probe.location,
      maxDistance: 8,
    }).length;
    return {
      pass:
        seated.join() === "0,2" &&
        before === "DFR" &&
        backAt >= 0 &&
        afterLeave === 2 &&
        after === "FFR" &&
        left === 0,
      detail: `seated=${seated} before=${before} waited=${waited} backAt=${backAt} afterLeave=${afterLeave} after=${after} left=${left}`,
    };
  } finally {
    fillers.release(probe ? asVehicleId(probe.id) : asVehicleId(""));
    for (const cow of cows) if (cow?.isValid) cow.remove();
    if (probe?.isValid) probe.remove();
  }
}

export function boatMonitor(a: Arena): Promise<Outcome> {
  return withBoat(a, async (boat) => {
    const hold = async (item: string): Promise<number> => {
      system.sendScriptEvent(
        TEST_HELD_ITEM_EVENT,
        `${boat.id},${item === "clear" ? item : id(item)}`,
      );
      await wait(2);
      return Number(boat.getProperty(entityPropertyId("monitor")));
    };
    await wait(2);
    const off = await hold("icebreaker_switch");
    system.sendScriptEvent(TEST_TOOL_EVENT, `${boat.id},icebreaker_switch,on`);
    await wait(2);
    const on = boat.getProperty(entityPropertyId("monitor"));
    const restored = boat.getProperty(entityPropertyId("icebreaker"));
    const rebuilt = rebuildVehicle(
      "sportsboat",
      asVehicleId(boat.id),
      boat.getRotation().y,
      [],
      { icebreaker: restored },
    );
    const commands = rebuilt.tick({
      tick: 0,
      riders: [],
      deckSeatInputs: [],
      location: boat.location,
      velocity: boat.getVelocity(),
      onGround: boat.isOnGround,
      waterAt: () => true,
      solidAt: () => false,
      blockTypes: () => [],
      targets: () => [],
      testHeld: { tool: "icebreaker_switch" },
    }).stepCommands;
    const restoredOn = commands.some(
      (c) => c.type === "setProperty" && c.name === "monitor" && c.value === 2,
    );
    const box = await hold("sportsboat_equipment_box");
    const cleared = await hold("clear");
    return {
      pass:
        off === 1 &&
        on === 2 &&
        box === 0 &&
        cleared === 0 &&
        restored === true &&
        restoredOn,
      detail: `off=${off} on=${on} box=${box} cleared=${cleared} saved=${restored} rebuilt=${restoredOn}`,
    };
  });
}

// The deepest pool the arena fits: its floor is the world's bottom layer. The
// icebreaker never cuts below the hull floor row (ADR 0175), so the `dried` check
// also asserts that the original bed rows stay.
const POOL_DEPTH = 3;

async function boatIcebreaker(
  a: Arena,
  liquid: "water" | "lava" | undefined,
  enabled: boolean,
): Promise<Outcome> {
  const { dim, gy } = a;
  const start = { x: 35.5, z: 35.5, yaw: -90 };
  const wallX = 37;
  const wallType =
    liquid === "water" ? "minecraft:packed_ice" : "minecraft:stone";
  const wall = a.at(wallX, gy - (liquid ? 1 : 0), 35);
  const highSide = a.at(wallX, gy + 3, 38);
  const run = () =>
    withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 0);
        await wait(2);
        dim.runCommand(
          `fill ${a.box(wallX, wall.y, 34, wallX, gy + 1, 36)} ${wallType}`,
        );
        dim.getBlock(highSide)?.setType("minecraft:stone");
        try {
          system.sendScriptEvent(
            TEST_TOOL_EVENT,
            `${boat.id},icebreaker_switch,${enabled ? "on" : "off"}`,
          );
          await wait(2);
          const switched =
            boat.getProperty(entityPropertyId("icebreaker")) === enabled;
          drive(boat, 0, 1);
          let ticks = 0;
          while (ticks < 60 && a.local(boat.location).x < wallX + 3) {
            await wait(1);
            ticks++;
          }
          drive(boat, 0, 0);
          const boatX = a.local(boat.location).x;
          const wallAfter = dim.getBlock(wall)?.typeId;
          const sideAfter = dim.getBlock(highSide)?.typeId;
          const shouldCut = enabled && liquid !== undefined;
          const cleared =
            wallAfter !== undefined &&
            wallAfter !== wallType &&
            sideAfter === "minecraft:air";
          const intact =
            wallAfter === wallType && sideAfter === "minecraft:stone";
          const moved = boatX > wallX + 2;
          const dried: string[] = [];
          if (liquid) {
            for (let x = 33; x <= 39; x++)
              for (let z = 32; z <= 39; z++)
                for (let y = gy - POOL_DEPTH; y < gy; y++) {
                  if (x === wallX && y === wall.y && z >= 34 && z <= 36)
                    continue;
                  const type = dim.getBlock(a.at(x, y, z))?.typeId;
                  if (
                    type !== `minecraft:${liquid}` &&
                    type !== `minecraft:flowing_${liquid}`
                  )
                    dried.push(`${x},${y},${z}:${type}`);
                }
          }
          return {
            pass:
              switched &&
              (shouldCut ? cleared && moved : intact && !moved) &&
              dried.length === 0,
            detail: `switched=${switched} wall=${wallAfter} side=${sideAfter} x=${boatX.toFixed(2)} ticks=${ticks} dried=${dried.length} ${dried.slice(0, 3).join(" ")}`,
          };
        } finally {
          dim.runCommand(
            `fill ${a.box(wallX, wall.y, 34, wallX, gy + 1, 36)} air`,
          );
          dim.getBlock(highSide)?.setType("minecraft:air");
        }
      },
      start,
      liquid ? 20 : 0,
    );
  return liquid ? withPool(a, POOL_DEPTH, run, liquid) : run();
}

export function boatIcebreakerIce(a: Arena): Promise<Outcome> {
  return boatIcebreaker(a, "water", true);
}

export function boatIcebreakerLava(a: Arena): Promise<Outcome> {
  return boatIcebreaker(a, "lava", true);
}

export function boatIcebreakerOff(a: Arena): Promise<Outcome> {
  return boatIcebreaker(a, "water", false);
}

export function boatIcebreakerBeached(a: Arena): Promise<Outcome> {
  return boatIcebreaker(a, undefined, true);
}

// Step 0 trace of the sinking bug and its guard (ADR 0175): a mountain closes the
// pool, and the boat must stay near its resting height while it cuts or stops.
async function boatIcebreakerMountain(
  a: Arena,
  enabled: boolean,
): Promise<Outcome> {
  const { dim, gy } = a;
  const start = { x: 35.5, z: 35.5, yaw: -90 };
  const wallX = 37;
  const surfacing = SPORTSBOAT_SPEC.icebreaker.surfacing;
  const mountainTop = gy + 8;
  // One fill is capped at 32,768 blocks, so fill the mountain in slabs along z.
  const fillMountain = (block: string, from: number, to: number) => {
    for (let z = POOL.minZ; z <= POOL.maxZ; z += 20)
      dim.runCommand(
        `fill ${a.box(wallX, from, z, POOL.maxX, to, Math.min(z + 19, POOL.maxZ))} ${block}`,
      );
  };
  const depthAt = (p: Vec3) => {
    const row = Math.floor(p.y);
    let cells = 0;
    while (
      cells < 4 &&
      isWater(
        dim.getBlock({ x: Math.floor(p.x), y: row + cells, z: Math.floor(p.z) })
          ?.typeId,
      )
    )
      cells++;
    return cells > 0 ? row + cells - p.y : 0;
  };
  return withPool(a, POOL_DEPTH, () =>
    withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 0);
        await wait(2);
        fillMountain("stone", gy - POOL_DEPTH, mountainTop);
        try {
          system.sendScriptEvent(
            TEST_TOOL_EVENT,
            `${boat.id},icebreaker_switch,${enabled ? "on" : "off"}`,
          );
          await wait(20);
          const restY = boat.location.y;
          const trace: string[] = [];
          let lowest = restY;
          let deepest = 0;
          drive(boat, 0, 1);
          for (let tick = 0; tick < 80; tick++) {
            await wait(1);
            const p = boat.location;
            const feet = dim.getBlock({
              x: Math.floor(p.x),
              y: Math.floor(p.y),
              z: Math.floor(p.z),
            });
            const depth = depthAt(p);
            lowest = Math.min(lowest, p.y);
            deepest = Math.max(deepest, depth);
            trace.push(
              `${p.y.toFixed(2)}/${depth.toFixed(2)}/${feet?.typeId?.replace("minecraft:", "")}`,
            );
          }
          drive(boat, 0, 0);
          const boatX = a.local(boat.location).x;
          const cell = dim.getBlock(a.at(wallX, gy, 35))?.typeId;
          const bedHoles: string[] = [];
          for (let x = 33; x <= wallX + 8; x++)
            for (let z = 32; z <= 39; z++)
              for (let y = gy - POOL_DEPTH; y < gy - 1; y++) {
                const type = dim.getBlock(a.at(x, y, z))?.typeId;
                if (type === "minecraft:air") bedHoles.push(`${x},${y},${z}`);
              }
          const steady =
            lowest >= restY - 0.6 && deepest <= surfacing.maxDepth + 0.2;
          const wallOk = enabled
            ? cell !== "minecraft:stone"
            : cell === "minecraft:stone" && boatX < wallX;
          return {
            pass: steady && wallOk && bedHoles.length === 0,
            detail: `rest=${restY.toFixed(2)} lowest=${lowest.toFixed(2)} deepest=${deepest.toFixed(2)} cell=${cell} x=${boatX.toFixed(2)} bedAir=${bedHoles.length} ${bedHoles.slice(0, 3).join(" ")} trace(y/depth/feet)=${trace.filter((_, i) => i % 4 === 0).join(" ")}`,
          };
        } finally {
          fillMountain("air", gy, mountainTop);
        }
      },
      start,
      20,
    ),
  );
}

export function boatIcebreakerMountainOn(a: Arena): Promise<Outcome> {
  return boatIcebreakerMountain(a, true);
}

export function boatIcebreakerMountainOff(a: Arena): Promise<Outcome> {
  return boatIcebreakerMountain(a, false);
}
