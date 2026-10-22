import { describe, expect, it } from "vitest";
import { PressCabinet } from "../../../src/application/vehicle/pressCabinet";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { decorSlot } from "../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { decorSlotCell } from "../../../src/domain/vehicle/kinds/camper/room";
import { CAMPER_SPEC } from "../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../src/domain/vehicle/kinds/index";
import { FakeClock, FakeWorld, parkedCamper } from "./fakes";

function setup() {
  const { car, pose, repo } = parkedCamper();
  const world = new FakeWorld();
  const clock = new FakeClock();
  const front = decorSlot("cabinet_sink_front");
  if (!front) throw new Error("no cabinet_sink_front slot");
  const press = new PressCabinet(world, repo, clock);
  const at = (tick: number) => {
    clock.tick = tick;
    return press.execute({
      playerId: asPlayerId("p"),
      vehicleId: car.id,
      cell: decorSlotCell(pose, front),
      point: slotPoint(pose, front),
    });
  };
  return { car, pose, repo, world, clock, press, front, at };
}

describe("PressCabinet (ADR 0114)", () => {
  it("opens the door without saving, then takes the pressed item back to the player and saves the rest", () => {
    const { car, world, at } = setup();
    car.setDecor("cabinet_sink_front", "toaster");
    car.setDecor("cabinet_sink_rear", "mug_pair");
    expect(at(100)).toBe(true);
    expect(world.calls).toEqual([]);
    expect(at(100 + CAMPER_SPEC.doorSwingTicks)).toBe(true);
    expect(world.calls).toEqual([
      "saveDecor:car:cabinet_sink_rear=mug_pair",
      "giveDecor:p:toaster",
    ]);
  });

  it("ignores a second press within the swing, an unknown vehicle, and an SUV", () => {
    const { repo, world, press, pose, front, at } = setup();
    expect(at(100)).toBe(true);
    expect(at(101)).toBe(false);
    const cell = decorSlotCell(pose, front);
    expect(
      press.execute({
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("unknown"),
        cell,
      }),
    ).toBe(false);
    const suv = createVehicle("suv", asVehicleId("suv"), 0);
    repo.save(suv);
    expect(
      press.execute({ playerId: asPlayerId("p"), vehicleId: suv.id, cell }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
