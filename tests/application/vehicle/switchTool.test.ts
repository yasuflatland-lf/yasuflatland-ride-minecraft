import fc from "fast-check";
import { expect, it } from "vitest";
import { SwitchFeedback } from "../../../src/application/vehicle/switchFeedback";
import { SwitchTool } from "../../../src/application/vehicle/switchTool";
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
  slot: 0,
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
  const use = new SwitchTool(bulldozerRepo(), clock);
  const cmd = { playerId: asPlayerId("d"), vehicleId, item: "blade_switch" };
  expect(use.execute(cmd)).toBe(true);
  clock.tick = 1;
  expect(use.execute(cmd)).toBe(false);
  clock.tick = 1 + SPEC.toolSwitchCooldown;
  expect(use.execute(cmd)).toBe(true);
  clock.tick += SPEC.toolSwitchCooldown;
  expect(use.execute({ ...cmd, playerId: asPlayerId("outsider") })).toBe(false);
  expect(use.execute({ ...cmd, vehicleId: asVehicleId("unknown") })).toBe(
    false,
  );
});

it("forces the blade for the test hook, and nothing for an unknown vehicle or a kind without a blade", () => {
  const repo = bulldozerRepo();
  repo.save(createVehicle("suv", asVehicleId("suv"), 0));
  const use = new SwitchTool(repo, new FakeClock());
  expect(use.force({ vehicleId, item: "blade_switch", state: "up" })).toBe(
    true,
  );
  expect(
    use.force({
      vehicleId: asVehicleId("unknown"),
      item: "blade_switch",
      state: "up",
    }),
  ).toBe(false);
  expect(
    use.force({
      vehicleId: asVehicleId("suv"),
      item: "blade_switch",
      state: "up",
    }),
  ).toBe(false);
});

it("reports the new tool state only for successful chase-camera switches", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        ["blade_switch", "up", "down", "blade_up", "blade_down"],
        [
          "wide_blade_switch",
          "wide",
          "normal",
          "wide_blade_wide",
          "wide_blade_normal",
        ],
        ["road_paver_switch", "on", "off", "road_paver_on", "road_paver_off"],
      ),
      fc.boolean(),
      ([item, first, second, firstKey, secondKey], thirdPerson) => {
        const repo = bulldozerRepo();
        const clock = new FakeClock();
        const messages: string[] = [];
        const feedback = new SwitchFeedback(
          { showMessage: (_, name) => messages.push(name) },
          { isThirdPerson: () => thirdPerson },
        );
        const use = new SwitchTool(repo, clock, feedback);
        const cmd = { playerId: driver.id, vehicleId, item };
        expect(use.execute({ ...cmd, playerId: asPlayerId("passenger") })).toBe(
          false,
        );
        expect(use.execute({ ...cmd, vehicleId: asVehicleId("missing") })).toBe(
          false,
        );
        expect(use.execute({ ...cmd, item: "unsupported" })).toBe(false);
        expect(messages).toEqual([]);
        expect(use.execute(cmd)).toBe(true);
        expect(repo.get(vehicleId)?.toolState(item)).toBe(first);
        expect(messages).toEqual(thirdPerson ? [firstKey] : []);
        expect(use.execute(cmd)).toBe(false);
        expect(messages).toEqual(thirdPerson ? [firstKey] : []);
        clock.tick += SPEC.toolSwitchCooldown;
        expect(use.execute(cmd)).toBe(true);
        expect(repo.get(vehicleId)?.toolState(item)).toBe(second);
        expect(messages).toEqual(thirdPerson ? [firstKey, secondKey] : []);
        use.force({ vehicleId, item, state: first });
        expect(messages).toHaveLength(thirdPerson ? 2 : 0);
      },
    ),
  );
});
