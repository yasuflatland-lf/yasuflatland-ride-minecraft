import { expect, it } from "vitest";
import { PressShowerToilet } from "../../../src/application/vehicle/pressShowerToilet";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { roomCells } from "../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { defined } from "../../support/defined";
import { FakeClock, parkedCamper } from "./fakes";

it("ignores unknown vehicles, SUVs, and a moving camper (ADR 0094)", () => {
  const { repo } = parkedCamper();
  const use = new PressShowerToilet(repo, new FakeClock());
  const feet = { x: 0, y: 65, z: 0 };
  expect(use.execute({ vehicleId: asVehicleId("unknown"), feet })).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(use.execute({ vehicleId: suv.id, feet })).toBe(false);
  const moving = createVehicle("camper", asVehicleId("moving"), 0);
  repo.save(moving);
  expect(use.execute({ vehicleId: moving.id, feet })).toBe(false);
});

it("passes the player's feet and the clock's tick to a parked camper: the door opens from outside and shuts from inside, once per swing, then the shower runs (ADR 0105, 0118)", () => {
  const { car, pose, repo } = parkedCamper();
  const clock = new FakeClock();
  const use = new PressShowerToilet(repo, clock);
  const cell = defined(
    roomCells(pose, false).find((c) => c.block.type === "showerToilet"),
    "shower-toilet cell",
  );
  const inside = { x: cell.x + 0.5, y: pose.y + 1, z: cell.z + 0.5 };
  const outside = { ...inside, x: inside.x + 3 };
  clock.tick = 100;
  expect(use.execute({ vehicleId: car.id, feet: outside })).toBe(true);
  clock.tick = 103;
  expect(use.execute({ vehicleId: car.id, feet: inside })).toBe(false);
  clock.tick = 100 + CAMPER_SPEC.doorSwingTicks;
  expect(use.execute({ vehicleId: car.id, feet: inside })).toBe(true);
  clock.tick += 3;
  expect(use.execute({ vehicleId: car.id, feet: inside })).toBe(false);
  clock.tick += CAMPER_SPEC.doorSwingTicks;
  expect(use.execute({ vehicleId: car.id, feet: inside })).toBe(true);
});
