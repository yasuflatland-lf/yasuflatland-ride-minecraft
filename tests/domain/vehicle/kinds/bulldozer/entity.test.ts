import { expect, it } from "vitest";
import {
  doorCommand,
  BULLDOZER_ENTITY as E,
  trackPhaseCommand,
  trackSpinCommand,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/entity";
import { formCommands } from "../../../../../src/domain/vehicle/motion/transformingEntity";
import { expectDeclaredCommand } from "../../../../support/entityContract";

it("declares the tracks, the door, and the transforming properties, and restores only the form", () => {
  expect(Object.keys(E.properties).sort()).toEqual([
    "bank",
    "door",
    "form",
    "gear_down",
    "spin_l",
    "spin_r",
    "track_l",
    "track_r",
  ]);
  expect(E.properties.bank.range).toStrictEqual([0, 0]);
  expect(E.restored).toEqual(["form"]);
});
it("builds only declared commands", () => {
  for (const c of [
    trackPhaseCommand("r", 2),
    trackPhaseCommand("l", 0),
    trackSpinCommand("r", 359),
    trackSpinCommand("l", 0),
    doorCommand(0.5),
    ...formCommands("hover"),
  ])
    expectDeclaredCommand(c, E);
});
