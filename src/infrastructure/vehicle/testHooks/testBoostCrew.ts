import {
  type Entity,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { cellOf } from "../../../domain/shared/cells";
import { asPlayerId, asVehicleId } from "../../../domain/shared/ids";
import { add3 } from "../../../domain/shared/vec";
import { BOOST_CONTROL } from "../../../domain/vehicle/boost";
import { profileOf } from "../../../domain/vehicle/kinds/index";
import { seatWorldPositions } from "../../../domain/vehicle/seats";
import type { Vehicle } from "../../../domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import { sampleBlock } from "../../shared/blocks";
import { id, NAMESPACE } from "../../shared/identifiers";
import { isWaterAt } from "../bedrock/water";

export const BOOST_RIDER_PROBE = "yasu_ride_test:boost_rider";
export const TEST_BOOST_RIDER_EVENT = /* @__PURE__ */ id("test_boost_rider");
export const TEST_BOOST_CREW_EVENT = /* @__PURE__ */ id("test_boost_crew");
export const TEST_BOOST_CREW_RESULT = /* @__PURE__ */ id(
  "test_boost_crew_result",
);

// BDS has no stable simulated-player API. Feed observed seating changes to the
// live aggregate synchronously so the normal (empty) rider snapshot cannot
// intervene. These stationary crew probes never send the returned impulses.
export function tickBoostCrew(
  vehicle: Vehicle,
  entity: Entity,
  riderIds: readonly string[],
): string | undefined {
  const location = entity.location;
  return vehicle.tick({
    tick: system.currentTick,
    location,
    velocity: entity.getVelocity(),
    onGround: entity.isOnGround,
    deckSeatInputs: [],
    targets: () => [],
    solidAt: (offset) =>
      sampleBlock(entity.dimension, cellOf(add3(location, offset)))?.solidTop ??
      false,
    waterAt: (offset) => isWaterAt(entity.dimension, add3(location, offset)),
    blockTypes: (cells) =>
      cells.map((cell) => entity.dimension.getBlock(cell)?.typeId),
    riders: riderIds.map((rider, slot) => ({
      id: asPlayerId(rider),
      slot,
      offset: { x: 0, z: 0 },
      yaw: entity.getRotation().y,
      raw: { moveX: 0, moveY: 0, jump: false },
    })),
  }).driverId;
}

function requestProbeSeats(vehicle: Vehicle, wanted: readonly Entity[]): void {
  if (vehicle.kind !== "camper") return;
  const offsets = seatWorldPositions(
    { x: 0, y: 0, z: 0, yaw: vehicle.yaw },
    profileOf(vehicle.kind).seats.positions,
  );
  wanted.forEach((rider, slot) => {
    const offset = offsets[slot];
    if (offset) vehicle.requestSeat(asPlayerId(rider.id), offset);
  });
}

// ChosenSeats only keeps identified players or pending boarding requests.
// Renew the physical probe's request each tick; SeatFillers can then retain
// the existing rider in its seat without needing a simulated player.
function boardCamperProbe(repo: VehicleRepository, message: string): void {
  const [vehicleId, riderId] = message.split(",");
  if (!vehicleId || !riderId) return;
  const vehicle = repo.get(asVehicleId(vehicleId));
  const entity = world.getEntity(vehicleId);
  const rider = world.getEntity(riderId);
  if (
    vehicle?.kind !== "camper" ||
    !entity ||
    rider?.typeId !== BOOST_RIDER_PROBE
  )
    return;
  const rideable = entity.getComponent("minecraft:rideable");
  if (!rideable || rideable.getRiders().length || !rideable.addRider(rider))
    return;
  requestProbeSeats(vehicle, [rider]);
  const timer = system.runInterval(() => {
    if (
      !entity.isValid ||
      !rider.isValid ||
      rideable.getRiders()[0]?.id !== rider.id
    ) {
      system.clearRun(timer);
      return;
    }
    requestProbeSeats(vehicle, [rider]);
  }, 1);
}

async function probeCrew(vehicle: Vehicle, entity: Entity): Promise<void> {
  const control = vehicle?.capability(BOOST_CONTROL);
  if (!control) return;
  const rideable = entity.getComponent("minecraft:rideable");
  if (!rideable || rideable.getRiders().length > 0) return;
  const probes: Entity[] = [];
  const board = () => {
    const rider = entity.dimension.spawnEntity(
      BOOST_RIDER_PROBE,
      entity.location,
    );
    probes.push(rider);
    if (!rideable.addRider(rider))
      throw new Error("Crew probe could not board");
    return rider;
  };

  // getRiders can still report an ejected entity for the rest of the tick.
  // Capture the actual order after each change and replay it synchronously
  // so production's intervening player-only snapshots cannot reset the crew.
  const observe = async (wanted: readonly Entity[]): Promise<string[]> => {
    const expected = wanted.map((rider) => rider.id).join(",");
    let snapshot: string[] = [];
    for (let tick = 0; tick < 8; tick++) {
      requestProbeSeats(vehicle, wanted);
      await new Promise<void>((resolve) => system.runTimeout(resolve, 1));
      snapshot = rideable.getRiders().map((rider) => rider.id);
      if (snapshot.join(",") === expected) return snapshot;
    }
    throw new Error(
      `Expected rider slots [${expected}], observed [${snapshot}]`,
    );
  };
  try {
    const driver = board();
    const passenger = rideable.seatCount > 1 ? board() : undefined;
    const aboard = await observe(passenger ? [driver, passenger] : [driver]);
    rideable.ejectRider(driver);
    const moved = passenger ? await observe([passenger]) : undefined;
    if (passenger) rideable.ejectRider(passenger);
    const departed = await observe([]);
    const first = tickBoostCrew(vehicle, entity, aboard);
    const started = control.toggle();
    let handover = "single";
    if (moved && passenger) {
      const successor = tickBoostCrew(vehicle, entity, moved);
      handover =
        successor === passenger.id && !control.isOn() ? "off" : "failed";
      if (!control.isOn()) control.toggle();
    }
    const empty = tickBoostCrew(vehicle, entity, departed);
    system.sendScriptEvent(
      TEST_BOOST_CREW_RESULT,
      [
        entity.id,
        first === driver.id && started,
        empty === undefined,
        control.isOn(),
        handover,
      ].join(","),
    );
  } finally {
    for (const rider of probes) if (rider.isValid) rider.remove();
    vehicle.resync();
  }
}

export function registerTestBoostCrew(repo: VehicleRepository): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (ev) => {
      if (ev.sourceType !== ScriptEventSource.Server) return;
      if (ev.id === TEST_BOOST_RIDER_EVENT) {
        boardCamperProbe(repo, ev.message);
        return;
      }
      if (ev.id !== TEST_BOOST_CREW_EVENT) return;
      const vehicle = repo.get(asVehicleId(ev.message));
      const entity = world.getEntity(ev.message);
      if (!vehicle || !entity) return;
      void probeCrew(vehicle, entity).catch((error) => {
        system.sendScriptEvent(
          TEST_BOOST_CREW_RESULT,
          [entity.id, String(error)].join(","),
        );
      });
    },
    { namespaces: [NAMESPACE] },
  );
}
