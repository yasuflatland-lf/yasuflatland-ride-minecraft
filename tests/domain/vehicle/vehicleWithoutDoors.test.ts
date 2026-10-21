import { expect, it, vi } from "vitest";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { rebuildVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SUV_PROFILE } from "../../../src/domain/vehicle/kinds/suv/profile";
import { defined } from "../../support/defined";
import { waterSensors } from "../../support/waterDepth";

vi.mock(
  "../../../src/domain/vehicle/kinds/suv/drive",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../src/domain/vehicle/kinds/suv/drive")
      >();
    return {
      ...original,
      SuvDrive: class extends original.SuvDrive {
        onSeatVacated() {
          return [];
        }
      },
    };
  },
);

it("emits no seat commands when the drive has no doors", () => {
  const vehicle = rebuildVehicle(
    "suv",
    asVehicleId("v"),
    0,
    [
      {
        id: asPlayerId("driver"),
        offset: defined(SUV_PROFILE.seats.positions[0], "driver seat"),
        yaw: 0,
        raw: { moveX: 0, moveY: 0, jump: false },
      },
    ],
    {},
  );
  const out = vehicle.tick({
    tick: 0,
    riders: [],
    deckSeatInputs: [],
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    ...waterSensors(),
    blockTypes: () => [],
    solidAt: () => false,
    targets: () => [],
  });
  expect(out.finalCommands).toStrictEqual([]);
});
