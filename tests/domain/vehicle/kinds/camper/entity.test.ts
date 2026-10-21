import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  doorCommand,
  showerCommand,
  showerDoorCommand,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("restores the form, docked, door, and shower door properties and writes the doors and the shower", () => {
  expect(CAMPER_ENTITY.restored).toEqual([
    "form",
    "docked",
    "door",
    "shower_door",
  ]);
  expect(doorCommand(1)).toEqual({
    type: "setProperty",
    name: "door",
    value: 1,
  });
  expect(showerDoorCommand(1)).toEqual({
    type: "setProperty",
    name: "shower_door",
    value: 1,
  });
  expect(showerCommand(true)).toEqual({
    type: "setProperty",
    name: "shower",
    value: true,
  });
});
