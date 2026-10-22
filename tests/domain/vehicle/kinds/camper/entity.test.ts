import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  cabinetDoorCommand,
  ceilingLightsCommand,
  doorCommand,
  SWITCH_CLICK,
  showerCommand,
  showerDoorCommand,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("restores the form, docked, door, and ceiling light properties and writes the doors, the shower, and the lights (ADR 0094, 0114, 0115)", () => {
  expect(CAMPER_ENTITY.restored).toEqual([
    "form",
    "docked",
    "door",
    "shower_door",
    "cabinet_sink_door",
    "cabinet_stove_door",
    "ceiling_lights",
  ]);
  expect(ceilingLightsCommand(true)).toEqual({
    type: "setProperty",
    name: "ceiling_lights",
    value: true,
  });
  expect(SWITCH_CLICK).toEqual({ type: "playSound", name: "random.click" });
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
