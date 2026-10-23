import { expect, it } from "vitest";
import { SwitchBlade } from "../../../src/application/vehicle/switchBlade";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import type { RiderView } from "../../../src/domain/vehicle/vehicle";
import { defined } from "../../support/defined";
import { FakeClock, InMemoryRepo } from "./fakes";

const vehicleId = asVehicleId("b");
const driver: RiderView = {
  id: asPlayerId("d"),
  offset: defined(BULLDOZER_PROFILE.seats.positions[0], "seat 0"),
  yaw: 0,
  raw: { moveX: 0, moveY: 0, jump: false },
};

function bulldozerRepo(): InMemoryRepo {
  const repo = new InMemoryRepo();
  repo.save(rebuildVehicle("bulldozer", vehicleId, 0, [driver], { blade: 0 }));
  return repo;
}

it("switches the blade for the driver, once per touch (ADR 0024, 0138)", () => {
  const clock = new FakeClock();
  const use = new SwitchBlade(bulldozerRepo(), clock);
  const cmd = { playerId: asPlayerId("d"), vehicleId };
  expect(use.execute(cmd)).toBe(true);
  clock.tick = 1;
  expect(use.execute(cmd)).toBe(false);
  clock.tick = 1 + SPEC.bladeSwitchCooldown;
  expect(use.execute(cmd)).toBe(true);
  clock.tick += SPEC.bladeSwitchCooldown;
  expect(use.execute({ ...cmd, playerId: asPlayerId("outsider") })).toBe(false);
  expect(use.execute({ ...cmd, vehicleId: asVehicleId("unknown") })).toBe(
    false,
  );
});

it("forces the blade for the test hook, and nothing for an unknown vehicle or a kind without a blade", () => {
  const repo = bulldozerRepo();
  repo.save(createVehicle("suv", asVehicleId("suv"), 0));
  const use = new SwitchBlade(repo, new FakeClock());
  expect(use.force({ vehicleId, raised: true })).toBe(true);
  expect(use.force({ vehicleId: asVehicleId("unknown"), raised: true })).toBe(
    false,
  );
  expect(use.force({ vehicleId: asVehicleId("suv"), raised: true })).toBe(
    false,
  );
});
