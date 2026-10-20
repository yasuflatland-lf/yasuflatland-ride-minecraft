import { expect, it } from "vitest";
import {
  CAMPER_ENTITY,
  dockCommands,
  undockCommands,
} from "../../../../../src/domain/vehicle/kinds/camper/entity";

it("docks and undocks with each event before its restored property", () => {
  expect(dockCommands()).toEqual([
    { type: "triggerEvent", name: "dock" },
    { type: "setProperty", name: "docked", value: true },
  ]);
  expect(undockCommands()).toEqual([
    { type: "triggerEvent", name: "undock" },
    { type: "setProperty", name: "docked", value: false },
  ]);
  expect(CAMPER_ENTITY.restored).toEqual(["form", "docked", "door"]);
});
