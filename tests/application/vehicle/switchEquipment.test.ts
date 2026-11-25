import fc from "fast-check";
import { expect, it } from "vitest";
import { SwitchEquipment } from "../../../src/application/vehicle/switchEquipment";
import { SwitchFeedback } from "../../../src/application/vehicle/switchFeedback";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { BULLDOZER_PROFILE } from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  equipmentSwitchOf,
  profileOf,
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

it("reports the new tool state only for successful chase-camera switches", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        ["bulldozer", "blade_switch", "up", "down", "blade_up", "blade_down"],
        [
          "bulldozer",
          "wide_blade_switch",
          "wide",
          "normal",
          "wide_blade_wide",
          "wide_blade_normal",
        ],
        [
          "bulldozer",
          "road_paver_switch",
          "on",
          "off",
          "road_paver_on",
          "road_paver_off",
        ],
        [
          "sportsboat",
          "icebreaker_switch",
          "on",
          "off",
          "icebreaker_on",
          "icebreaker_off",
        ],
      ),
      fc.boolean(),
      ([kind, item, first, second, firstKey, secondKey], thirdPerson) => {
        const repo = new InMemoryRepo();
        const offset = defined(profileOf(kind).seats.positions[0], "seat 0");
        repo.save(
          rebuildVehicle(kind, vehicleId, 0, [{ ...driver, offset }], {
            blade: 0,
          }),
        );
        const clock = new FakeClock();
        const messages: string[] = [];
        const feedback = new SwitchFeedback(
          { showMessage: (_, name) => messages.push(name) },
          { isThirdPerson: () => thirdPerson },
        );
        const use = new SwitchEquipment(repo, clock, feedback);
        const equipmentSwitch = defined(equipmentSwitchOf(item), item);
        const cmd = { playerId: driver.id, vehicleId, switch: equipmentSwitch };
        expect(use.execute({ ...cmd, playerId: asPlayerId("passenger") })).toBe(
          false,
        );
        expect(use.execute({ ...cmd, vehicleId: asVehicleId("missing") })).toBe(
          false,
        );
        expect(
          use.execute({
            ...cmd,
            switch: defined(
              equipmentSwitchOf(
                kind === "bulldozer" ? "icebreaker_switch" : "blade_switch",
              ),
              "switch of a different kind",
            ),
          }),
        ).toBe(false);
        expect(messages).toEqual([]);
        expect(use.execute(cmd)).toBe(true);
        expect(repo.get(vehicleId)?.equipmentState(equipmentSwitch)).toBe(
          first,
        );
        expect(messages).toEqual(thirdPerson ? [firstKey] : []);
        expect(use.execute(cmd)).toBe(false);
        expect(messages).toEqual(thirdPerson ? [firstKey] : []);
        clock.tick += SPEC.equipmentSwitchCooldown;
        expect(use.execute(cmd)).toBe(true);
        expect(repo.get(vehicleId)?.equipmentState(equipmentSwitch)).toBe(
          second,
        );
        expect(messages).toEqual(thirdPerson ? [firstKey, secondKey] : []);
      },
    ),
  );
});
