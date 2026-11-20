import fc from "fast-check";
import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  ceilingLightsCommand,
  doorCommand,
  SWITCH_CLICK,
  showerCommand,
  showerDoorCommand,
  storageDoorCommand,
  storageDoorProperty,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";
import { profileOf } from "../../../../../src/domain/vehicle/kinds/index";
import { expectDeclaredCommand } from "../../../../support/entityContract";

it("restores the form, docked, door, and ceiling light properties (ADR 0094, 0114, 0115, 0123)", () => {
  expect(CAMPER_ENTITY.restored).toEqual([
    "form",
    "docked",
    "door",
    "shower_door",
    "cabinet_sink_door",
    "cabinet_stove_door",
    "fridge_top_door",
    "fridge_bottom_door",
    "drawer_top",
    "drawer_bottom",
    "ceiling_lights",
  ]);
  expect(SWITCH_CLICK).toEqual({ type: "playSound", name: "random.click" });
});

it("writes each kitchen drawer to its own restored slide property", () => {
  for (const door of ["drawer_top", "drawer_bottom"] as const) {
    expect(storageDoorProperty(door)).toBe(door);
    expect(CAMPER_ENTITY.restored).toContain(door);
    expect(storageDoorCommand(door, 0.4)).toEqual({
      type: "setProperty",
      name: door,
      value: 0.4,
    });
  }
  expect(storageDoorProperty("sink")).toBe("cabinet_sink_door");
});

it.each([
  ["door", doorCommand, 0, 1],
  ["shower_door", showerDoorCommand, 0, 1],
  [
    "cabinet_sink_door",
    (value: number) => storageDoorCommand("sink", value),
    0,
    1,
  ],
  [
    "cabinet_stove_door",
    (value: number) => storageDoorCommand("stove", value),
    0,
    1,
  ],
  [
    "fridge_top_door",
    (value: number) => storageDoorCommand("fridge_top", value),
    0,
    1,
  ],
  [
    "fridge_bottom_door",
    (value: number) => storageDoorCommand("fridge_bottom", value),
    0,
    1,
  ],
] as const)(
  "writes the declared %s property over its range",
  (name, build, min, max) => {
    fc.assert(
      fc.property(fc.double({ min, max, noNaN: true }), (value) => {
        const command = build(value);
        expect(command).toEqual({ type: "setProperty", name, value });
        expectDeclaredCommand(command, CAMPER_ENTITY, profileOf("camper"));
      }),
    );
  },
);

it.each([
  ["ceiling_lights", ceilingLightsCommand],
  ["shower", showerCommand],
] as const)("writes the declared %s boolean property", (name, build) => {
  for (const value of [false, true]) {
    const command = build(value);
    expect(command).toEqual({ type: "setProperty", name, value });
    expectDeclaredCommand(command, CAMPER_ENTITY, profileOf("camper"));
  }
});
