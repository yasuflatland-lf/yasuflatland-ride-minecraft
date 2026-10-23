import { expect, it } from "vitest";
import {
  bladeCommand,
  doorCommand,
  BULLDOZER_ENTITY as E,
  trackPhaseCommand,
  trackSpinCommand,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/entity";
import { formCommands } from "../../../../../src/domain/vehicle/motion/transformingEntity";
import { expectDeclaredCommand } from "../../../../support/entityContract";

it("declares the tracks, the door, the blade, and the transforming properties, and restores the form and the blade", () => {
  expect(Object.keys(E.properties).sort()).toEqual([
    "bank",
    "blade",
    "door",
    "form",
    "gear_down",
    "spin_l",
    "spin_r",
    "track_l",
    "track_r",
  ]);
  // BDS 1.26.52.3 rejects [0.0, 0.0]: "range max is less than range min" (ADR 0136).
  expect(E.properties.bank.range).toStrictEqual([0, 1]);
  expect(E.properties.blade).toStrictEqual({ type: "float", range: [0, 1] });
  expect(E.restored).toEqual(["form", "blade"]);
});
it("builds only declared commands", () => {
  for (const c of [
    trackPhaseCommand("r", 2),
    trackPhaseCommand("l", 0),
    trackSpinCommand("r", 359),
    trackSpinCommand("l", 0),
    doorCommand(0.5),
    bladeCommand(0.5),
    bladeCommand(0),
    bladeCommand(1),
    ...formCommands("hover"),
  ])
    expectDeclaredCommand(c, E);
});
