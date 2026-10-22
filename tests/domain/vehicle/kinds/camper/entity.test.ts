import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  ceilingLightsCommand,
  doorCommand,
  SWITCH_CLICK,
  showerCommand,
  showerDoorCommand,
  storageDoorCommand,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("restores the form, docked, door, and ceiling light properties and writes the doors, the shower, and the lights (ADR 0094, 0114, 0115, 0123)", () => {
  expect(CAMPER_ENTITY.restored).toEqual([
    "form",
    "docked",
    "door",
    "shower_door",
    "cabinet_sink_door",
    "cabinet_stove_door",
    "fridge_top_door",
    "fridge_bottom_door",
    "ceiling_lights",
  ]);
  expect(ceilingLightsCommand(true)).toEqual({
    type: "setProperty",
    name: "ceiling_lights",
    value: true,
  });
  expect(SWITCH_CLICK).toEqual({ type: "playSound", name: "random.click" });
  expect(storageDoorCommand("sink", 0.5)).toEqual({
    type: "setProperty",
    name: "cabinet_sink_door",
    value: 0.5,
  });
  expect(storageDoorCommand("stove", 1)).toEqual({
    type: "setProperty",
    name: "cabinet_stove_door",
    value: 1,
  });
  expect(storageDoorCommand("fridge_top", 0.3)).toEqual({
    type: "setProperty",
    name: "fridge_top_door",
    value: 0.3,
  });
  expect(storageDoorCommand("fridge_bottom", 1)).toEqual({
    type: "setProperty",
    name: "fridge_bottom_door",
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
