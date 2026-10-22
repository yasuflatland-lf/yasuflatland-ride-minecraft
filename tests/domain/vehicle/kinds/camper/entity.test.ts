import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  cabinetDoorCommand,
  doorCommand,
  showerCommand,
  showerDoorCommand,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("restores the form, docked, and door properties and writes the doors and the shower (ADR 0094, 0114)", () => {
  expect(CAMPER_ENTITY.restored).toEqual([
    "form",
    "docked",
    "door",
    "shower_door",
    "cabinet_sink_door",
    "cabinet_stove_door",
  ]);
  expect(cabinetDoorCommand("sink", 0.5)).toEqual({
    type: "setProperty",
    name: "cabinet_sink_door",
    value: 0.5,
  });
  expect(cabinetDoorCommand("stove", 1)).toEqual({
    type: "setProperty",
    name: "cabinet_stove_door",
    value: 1,
  });
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
