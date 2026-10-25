import { describe, expect, it } from "vitest";
import { SwitchHeadlights } from "../../../src/application/vehicle/switchHeadlights";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { rebuildVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import type { RiderView } from "../../../src/domain/vehicle/vehicle";
import {
  FakeClock,
  FakeWorld,
  InMemoryRepo,
  parkedCamper,
  stillTick,
} from "./fakes";

// Seat positions of the driver (0) and front passenger (1) with the vehicle heading +z.
const SEAT_OFFSETS = [
  { x: -0.38, z: 0.2 },
  { x: 0.38, z: 0.2 },
] as const;

const rider = (id: string, seat: 0 | 1): RiderView => ({
  id: asPlayerId(id),
  offset: SEAT_OFFSETS[seat],
  yaw: 0,
  raw: { moveX: 0, moveY: 0, jump: false },
});

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  repo.save(
    rebuildVehicle(
      "suv",
      asVehicleId("a"),
      0,
      [rider("d", 0), rider("p", 1)],
      {},
    ),
  );
  world.headlights.set("a", false);
  const clock = new FakeClock();
  return { world, uc: new SwitchHeadlights(world, repo, clock), clock };
}

describe("SwitchHeadlights (ADR 0020)", () => {
  it("the driver turns the headlights on and off again", () => {
    const { world, uc, clock } = setup();
    expect(
      uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") }),
    ).toBe(true);
    expect(world.headlights.get("a")).toBe(true);
    const later = SPEC.headlightSwitchCooldown;
    clock.tick = later;
    expect(
      uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") }),
    ).toBe(true);
    expect(world.headlights.get("a")).toBe(false);
  });

  it("a passenger cannot switch them", () => {
    const { world, uc } = setup();
    expect(
      uc.execute({ playerId: asPlayerId("p"), vehicleId: asVehicleId("a") }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });

  it("the parked camper's deck seat at the wheel switches the headlights", () => {
    const { car, repo } = parkedCamper();
    expect(stillTick(car, 21, "d").dock).toBeDefined();
    const world = new FakeWorld();
    world.headlights.set("car", false);
    const clock = new FakeClock();
    const use = new SwitchHeadlights(world, repo, clock);
    const cmd = { playerId: asPlayerId("d"), vehicleId: car.id };
    expect(use.execute(cmd)).toBe(true);
    expect(world.headlights.get("car")).toBe(true);
    clock.tick = SPEC.headlightSwitchCooldown;
    expect(use.execute(cmd)).toBe(true);
    expect(world.headlights.get("car")).toBe(false);
    expect(use.execute({ ...cmd, playerId: asPlayerId("p") })).toBe(false);
  });

  it("one tap that arrives twice switches only once", () => {
    const { world, uc, clock } = setup();
    uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") });
    clock.tick = 1;
    uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") });
    expect(world.calls).toEqual(["headlights:a:true"]);
  });

  it("a held touch that repeats the use switches only once", () => {
    const { world, uc, clock } = setup();
    for (const tick of [0, 4, 8, 13, 17, 21]) {
      clock.tick = tick;
      uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") });
    }
    expect(world.calls).toEqual(["headlights:a:true"]);
  });

  it("does nothing for a vehicle that is not loaded or no longer exists", () => {
    const { world, uc } = setup();
    expect(
      uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("b") }),
    ).toBe(false);
    world.headlights.delete("a");
    expect(
      uc.execute({ playerId: asPlayerId("d"), vehicleId: asVehicleId("a") }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
