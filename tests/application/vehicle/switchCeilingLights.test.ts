import { expect, it } from "vitest";
import { SwitchCeilingLights } from "../../../src/application/vehicle/switchCeilingLights";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { FakeClock, InMemoryRepo, parkedCamper, stillTick } from "./fakes";

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
