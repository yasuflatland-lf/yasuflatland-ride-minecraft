import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { SwitchBoost } from "../../../src/application/vehicle/switchBoost";
import { SwitchFeedback } from "../../../src/application/vehicle/switchFeedback";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import {
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { defined } from "../../support/defined";
import { riderView } from "../../support/riders";
import { FakeClock, InMemoryRepo } from "./fakes";

it("reports successful toggles in third person and an unavailable boost in either camera", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("suv", "camper", "scooter", "bulldozer", "sportsboat"),
      fc.boolean(),
      (kind, thirdPerson) => {
        const vehicleId = asVehicleId("v");
        const driver = riderView("driver", {
          offset: defined(profileOf(kind).seats.positions[0], "driver seat"),
        });
        const vehicle = rebuildVehicle(kind, vehicleId, 0, [driver], {});
        const repo = new InMemoryRepo();
        repo.save(vehicle);
        const clock = new FakeClock();
        const world = { showMessage: vi.fn() };
        const feedback = new SwitchFeedback(world, {
          isThirdPerson: () => thirdPerson,
        });
        const use = new SwitchBoost(repo, clock, feedback, world);
        const onToggle = vi.fn();
        const cmd = { playerId: driver.id, vehicleId };
        const outsider = asPlayerId("outside");
        expect(use.execute({ ...cmd, playerId: outsider })).toBe(false);
        expect(use.execute({ ...cmd, vehicleId: asVehicleId("missing") })).toBe(
          false,
        );
        expect(world.showMessage).not.toHaveBeenCalled();

        if (kind === "sportsboat") {
          expect(vehicle.switchBoost(outsider, 0)).toBe("denied");
          expect(vehicle.switchBoost(driver.id, 0)).toBe("unavailable");
          expect(use.execute(cmd, onToggle)).toBe(true);
          expect(onToggle).not.toHaveBeenCalled();
          expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
            driver.id,
            "boost_unavailable",
          );
          return;
        }

        expect(use.execute(cmd, onToggle)).toBe(true);
        expect(use.execute(cmd, onToggle)).toBe(false);
        clock.tick += SPEC.boosterSwitchCooldown;
        expect(use.execute(cmd, onToggle)).toBe(true);
        expect(onToggle).toHaveBeenCalledTimes(2);
        expect(world.showMessage.mock.calls).toEqual(
          thirdPerson
            ? [
                [driver.id, "boost_on"],
                [driver.id, "boost_off"],
              ]
            : [],
        );
      },
    ),
  );
});
