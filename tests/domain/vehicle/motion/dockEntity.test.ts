import { expect, it } from "vitest";
import { CAMPER_ENTITY } from "../../../../src/domain/vehicle/kinds/camper/entity";
import { SPORTSBOAT_ENTITY } from "../../../../src/domain/vehicle/kinds/sportsboat/entity";
import {
  DOCK_EVENTS,
  DOCK_PROPERTIES,
  dockCommands,
  undockCommands,
} from "../../../../src/domain/vehicle/motion/dockEntity";

it("triggers dock before recording the docked state", () => {
  expect(dockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "dock" },
    { type: "setProperty", name: "docked", value: true },
  ]);
});

it("triggers undock before clearing the docked state", () => {
  expect(undockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "undock" },
    { type: "setProperty", name: "docked", value: false },
  ]);
});

it("is shared by every kind that docks", () => {
  for (const contract of [SPORTSBOAT_ENTITY, CAMPER_ENTITY]) {
    expect(contract.properties.docked).toEqual(DOCK_PROPERTIES.docked);
    for (const name of DOCK_EVENTS) expect(contract.events).toContain(name);
  }
});
