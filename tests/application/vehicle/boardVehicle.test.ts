import { expect, it } from "vitest";
import { BoardVehicle } from "../../../src/application/vehicle/boardVehicle";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_PROFILE } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../src/domain/vehicle/kinds/sportsboat/spec";
import { InMemoryRepo, stillTick } from "./fakes";

// Standing on the boat's left at yaw 0 (left is +x), looking down at the rear-left seat.
const rearLeft = SPORTSBOAT_PROFILE.seats.positions[3] ?? { x: 0, z: 0 };
const eye = { x: 2, y: 1.62, z: -1 };
const view = {
  x: rearLeft.x - eye.x,
  y: SPORTSBOAT_SPEC.seatAimHeight - eye.y,
  z: rearLeft.z - eye.z,
};

it("leaves boarding to the engine for an unknown vehicle and an SUV, and takes it over for a boat (ADR 0120)", () => {
  const repo = new InMemoryRepo();
  const board = new BoardVehicle(repo);
  const playerId = asPlayerId("player");
  expect(
    board.execute({ playerId, vehicleId: asVehicleId("unknown"), eye, view }),
  ).toBe(false);
  const suv = createVehicle("suv", asVehicleId("suv"), 0);
  repo.save(suv);
  expect(board.execute({ playerId, vehicleId: suv.id, eye, view })).toBe(false);
  const boat = createVehicle("sportsboat", asVehicleId("boat"), 0);
  repo.save(boat);
  expect(board.execute({ playerId, vehicleId: boat.id, eye, view })).toBe(true);
  expect(stillTick(boat, 0).seatLayout).toEqual([
    undefined,
    undefined,
    undefined,
    playerId,
  ]);
});
