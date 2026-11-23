import { expect, it } from "vitest";
import { FindBedSpawnCell } from "../../../../src/application/vehicle/room/findBedSpawnCell";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { localCellAt } from "../../../../src/domain/vehicle/kinds/camper/parkPose";
import { roomCells } from "../../../../src/domain/vehicle/kinds/camper/roomCells";
import { defined } from "../../../support/defined";
import { parkedCamper } from "../fakes";

it("returns the parked camper's aisle spawn cell and ignores unknown vehicles and other cells (ADR 0182)", () => {
  const { car, pose, repo } = parkedCamper();
  const use = new FindBedSpawnCell(repo);
  const { x, y, z } = defined(
    roomCells(pose, false).find((c) => c.block.type === "bed"),
    "bed cell",
  );
  const cell = { x, y, z };
  expect(use.execute({ vehicleId: car.id, cell })).toEqual(
    localCellAt(pose, { x: 0, z: -2, layer: 1 }),
  );
  expect(
    use.execute({ vehicleId: asVehicleId("unknown"), cell }),
  ).toBeUndefined();
  expect(
    use.execute({ vehicleId: car.id, cell: { ...cell, y: y + 3 } }),
  ).toBeUndefined();
});
