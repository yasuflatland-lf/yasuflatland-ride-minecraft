import { expect, it } from "vitest";
import { SwitchCeilingLights } from "../../../../src/application/vehicle/room/switchCeilingLights";
import { SwitchHeadlights } from "../../../../src/application/vehicle/switchHeadlights";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import {
  CAMPER_ROOM,
  createVehicle,
} from "../../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../../src/domain/vehicle/spec";
import { defined } from "../../../support/defined";
import {
  FakeClock,
  FakeWorld,
  InMemoryRepo,
  parkedCamper,
  stillTick,
} from "../fakes";

// stillTick parks the camper at (0.5, 64, 0.5): its floor top is 65.
const FEET = { x: 0.5, y: 65, z: 0.5 };
const player = asPlayerId("p");

it("switches the lights of a parked camper for a player inside, once per touch (ADR 0115)", () => {
  const { car, repo } = parkedCamper();
  const clock = new FakeClock();
  const use = new SwitchCeilingLights(repo, clock);
  const cmd = { playerId: player, vehicleId: car.id, feet: FEET };
  expect(use.execute(cmd)).toBe(true);
  clock.tick = 1;
  expect(use.execute(cmd)).toBe(false);
  clock.tick = 1 + SPEC.headlightSwitchCooldown;
  expect(use.execute(cmd)).toBe(true);
  clock.tick += SPEC.headlightSwitchCooldown;
  expect(use.execute({ ...cmd, feet: { ...FEET, y: FEET.y + 4 } })).toBe(false);
  clock.tick++;
  expect(use.execute(cmd)).toBe(false);
});

it("keeps the parked camper's deck driver on the headlights instead of the room lights", () => {
  const { car, repo } = parkedCamper();
  stillTick(car, 21, "d");
  const use = new SwitchCeilingLights(repo, new FakeClock());
  const cmd = { playerId: asPlayerId("d"), vehicleId: car.id, feet: FEET };
  expect(use.canSwitch(cmd)).toBe(false);
  expect(use.execute(cmd)).toBe(false);
  expect(use.canSwitch({ ...cmd, playerId: player })).toBe(true);
});

it("tells whether a use would reach the lights without switching them or starting the cooldown (ADR 0115)", () => {
  const { car, repo } = parkedCamper();
  const use = new SwitchCeilingLights(repo, new FakeClock());
  const cmd = { playerId: player, vehicleId: car.id, feet: FEET };
  expect(use.canSwitch(cmd)).toBe(true);
  expect(use.canSwitch({ ...cmd, feet: { ...FEET, y: FEET.y + 4 } })).toBe(
    false,
  );
  expect(use.canSwitch({ ...cmd, vehicleId: asVehicleId("unknown") })).toBe(
    false,
  );
  expect(use.execute(cmd)).toBe(true);
  expect(use.canSwitch(cmd)).toBe(true);
});

it("ignores unknown vehicles, SUVs, and a camper that is not parked (ADR 0115)", () => {
  const repo = new InMemoryRepo();
  const use = new SwitchCeilingLights(repo, new FakeClock());
  const at = (id: string) => ({
    playerId: player,
    vehicleId: asVehicleId(id),
    feet: FEET,
  });
  expect(use.execute(at("unknown"))).toBe(false);
  repo.save(createVehicle("suv", asVehicleId("suv"), 0));
  expect(use.execute(at("suv"))).toBe(false);
  const camper = createVehicle("camper", asVehicleId("camper"), 0);
  repo.save(camper);
  stillTick(camper, 0);
  expect(use.execute(at("camper"))).toBe(false);
});

it("flips only on a use that follows the headlight switch's cooldown of idle switch, whoever uses it", () => {
  const { car, repo } = parkedCamper();
  const fixtures = defined(car.capability(CAMPER_ROOM), "camper room").fixtures;
  const clock = new FakeClock();
  const use = new SwitchCeilingLights(repo, clock);
  const cmd = { playerId: player, vehicleId: car.id, feet: FEET };
  expect(fixtures.switchCeilingLights(FEET, 0)).toBe(true);
  clock.tick = SPEC.headlightSwitchCooldown - 1;
  expect(use.execute(cmd)).toBe(false);
  clock.tick++;
  expect(use.execute({ ...cmd, playerId: asPlayerId("other") })).toBe(false);
  clock.tick += SPEC.headlightSwitchCooldown;
  expect(use.execute(cmd)).toBe(true);
});

it("keeps its cooldown apart from the driver's headlight switch", () => {
  const { car, repo } = parkedCamper();
  stillTick(car, 21, "d");
  const clock = new FakeClock();
  const world = new FakeWorld();
  world.headlights.set(car.id, false);
  const headlights = new SwitchHeadlights(world, repo, clock);
  const ceiling = new SwitchCeilingLights(repo, clock);
  const driver = { playerId: asPlayerId("d"), vehicleId: car.id, feet: FEET };
  expect(headlights.execute(driver)).toBe(true);
  expect(ceiling.execute(driver)).toBe(false);
  clock.tick++;
  expect(ceiling.execute({ ...driver, playerId: player })).toBe(true);
  expect(headlights.execute(driver)).toBe(false);
  clock.tick += SPEC.headlightSwitchCooldown;
  expect(ceiling.execute({ ...driver, playerId: player })).toBe(true);
  expect(headlights.execute(driver)).toBe(true);
});
