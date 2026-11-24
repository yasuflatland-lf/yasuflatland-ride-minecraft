import { describe, expect, it } from "vitest";
import { RemoveDecor } from "../../../../src/application/vehicle/room/removeDecor";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { decorSlot } from "../../../../src/domain/vehicle/kinds/camper/decor";
import { decorSlotCell } from "../../../../src/domain/vehicle/kinds/camper/decorCells";
import { slotPoint } from "../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CAMPER_ROOM } from "../../../../src/domain/vehicle/kinds/index";
import { decorItemId, decorSlotId } from "../../../support/decorIds";
import { FakeWorld, parkedCamper } from "../fakes";

function setup() {
  const { car, pose, repo } = parkedCamper();
  const world = new FakeWorld();
  const stove = decorSlot(decorSlotId("stove"));
  if (!stove) throw new Error("no stove slot");
  return { car, pose, world, remove: new RemoveDecor(world, repo), stove };
}

describe("RemoveDecor (ADR 0093)", () => {
  it("takes the decor at the cell back to the player and saves the rest (ADR 0093)", () => {
    const { car, pose, world, remove, stove } = setup();
    car
      .capability(CAMPER_ROOM)
      ?.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator"));
    car
      .capability(CAMPER_ROOM)
      ?.decor.placeDecor(decorSlotId("table"), decorItemId("mug_pair"));
    expect(
      remove.execute({
        playerId: asPlayerId("p"),
        vehicleId: car.id,
        cell: decorSlotCell(pose, stove),
      }),
    ).toBe(true);
    expect(world.calls).toEqual([
      "saveDecor:car:table=mug_pair",
      "giveDecor:p:percolator",
    ]);
    expect(car.capability(CAMPER_ROOM)?.decor.decor()).toEqual([
      { slot: "table", item: "mug_pair" },
    ]);
  });

  it("takes back the end of the table along the line of sight (ADR 0108, 0110)", () => {
    const { car, pose, world, remove } = setup();
    car
      .capability(CAMPER_ROOM)
      ?.decor.placeDecor(decorSlotId("table"), decorItemId("fruit_bowl"));
    car
      .capability(CAMPER_ROOM)
      ?.decor.placeDecor(decorSlotId("table_aisle"), decorItemId("mug_pair"));
    const aisle = decorSlot(decorSlotId("table_aisle"));
    const table = decorSlot(decorSlotId("table"));
    if (!aisle || !table) throw new Error("missing table slots");
    const aim = slotPoint(pose, aisle);
    const other = slotPoint(pose, table);
    const point = { ...other, y: aim.y - 1 };
    const eye = {
      x: 2 * aim.x - point.x,
      y: aim.y + 1,
      z: 2 * aim.z - point.z,
    };
    expect(
      remove.execute({
        playerId: asPlayerId("p"),
        vehicleId: car.id,
        cell: decorSlotCell(pose, aisle),
        point,
        eye,
      }),
    ).toBe(true);
    expect(world.calls).toEqual([
      "saveDecor:car:table=fruit_bowl",
      "giveDecor:p:mug_pair",
    ]);
  });

  it("does nothing for a cell without decor or an unknown vehicle", () => {
    const { car, pose, world, remove, stove } = setup();
    const cell = decorSlotCell(pose, stove);
    expect(
      remove.execute({ playerId: asPlayerId("p"), vehicleId: car.id, cell }),
    ).toBe(false);
    car
      .capability(CAMPER_ROOM)
      ?.decor.placeDecor(decorSlotId("stove"), decorItemId("percolator"));
    expect(
      remove.execute({
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("unknown"),
        cell,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
