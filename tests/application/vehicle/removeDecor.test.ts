import { describe, expect, it } from "vitest";
import { RemoveDecor } from "../../../src/application/vehicle/removeDecor";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { decorSlot } from "../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { decorSlotCell } from "../../../src/domain/vehicle/kinds/camper/room";
import { decorItemId, decorSlotId } from "../../support/decorIds";
import { FakeWorld, parkedCamper } from "./fakes";

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
    car.asRoom()?.placeDecor(decorSlotId("stove"), decorItemId("percolator"));
    car.asRoom()?.placeDecor(decorSlotId("table"), decorItemId("mug_pair"));
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
    expect(car.asRoom()?.decor()).toEqual([
      { slot: "table", item: "mug_pair" },
    ]);
  });

  it("takes back the end of the table nearest the pressed point (ADR 0108)", () => {
    const { car, pose, world, remove } = setup();
    car.asRoom()?.placeDecor(decorSlotId("table"), decorItemId("fruit_bowl"));
    car
      .asRoom()
      ?.placeDecor(decorSlotId("table_aisle"), decorItemId("mug_pair"));
    const aisle = decorSlot(decorSlotId("table_aisle"));
    if (!aisle) throw new Error("no table_aisle slot");
    expect(
      remove.execute({
        playerId: asPlayerId("p"),
        vehicleId: car.id,
        cell: decorSlotCell(pose, aisle),
        point: slotPoint(pose, aisle),
        eye: { ...slotPoint(pose, aisle), y: pose.y + 3 },
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
    car.asRoom()?.placeDecor(decorSlotId("stove"), decorItemId("percolator"));
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
