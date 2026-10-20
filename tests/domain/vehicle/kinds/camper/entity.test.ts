import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  doorCommand,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("restores the form, docked, and door properties and writes the door", () => {
  expect(CAMPER_ENTITY.restored).toEqual(["form", "docked", "door"]);
  expect(doorCommand(1)).toEqual({
    type: "setProperty",
    name: "door",
    value: 1,
  });
});
