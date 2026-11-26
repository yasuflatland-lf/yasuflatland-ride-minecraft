import { expect, it, vi } from "vitest";
import { GuideNav } from "../../../src/application/vehicle/guideNav";
import { NavSelections } from "../../../src/application/vehicle/navSelections";
import type { NavWorld } from "../../../src/application/vehicle/ports/drive";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { rebuildVehicle } from "../../../src/domain/vehicle/kinds/index";
import { NavGuideThrottle } from "../../../src/domain/vehicle/navigation/navGuide";
import { riderView } from "../../support/riders";
import { InMemoryRepo } from "./fakes";

const vehicleId = asVehicleId("suv");
const otherVehicleId = asVehicleId("other");
const driver = riderView("driver");
const passenger = riderView("passenger", { seat: 1 });

function setup() {
  const repo = new InMemoryRepo();
  repo.save(rebuildVehicle("suv", vehicleId, 0, [driver, passenger], {}));
  repo.save(rebuildVehicle("suv", otherVehicleId, 0, [], {}));
  const world = {
    dimensionOf: vi.fn<NavWorld["dimensionOf"]>(),
    choose: vi.fn<NavWorld["choose"]>(),
    giveMap: vi.fn<NavWorld["giveMap"]>(),
    showMessage: vi.fn<NavWorld["showMessage"]>(),
  };
  const selections = new NavSelections();
  return {
    guide: new GuideNav(repo, world, selections, new NavGuideThrottle()),
    world,
    selections,
    command: {
      playerId: driver.id,
      vehicleId,
      controls: "touch",
      trigger: "select",
      tick: 10,
    } as const,
  };
}

it.each([undefined, otherVehicleId])(
  "stays silent when the player does not ride the supplied vehicle (%s)",
  (id) => {
    const { guide, world, command } = setup();
    guide.execute({ ...command, vehicleId: id });
    expect(world.showMessage).not.toHaveBeenCalled();
  },
);

it("suppresses selection and tap guidance while a Nav selection is pending", () => {
  const { guide, world, selections, command } = setup();
  selections.begin(command.playerId);
  guide.execute(command);
  guide.execute({ ...command, trigger: "tap" });
  expect(world.showMessage).not.toHaveBeenCalled();

  selections.end(command.playerId);
  guide.execute({ ...command, trigger: "tap" });
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
    driver.id,
    "nav_open_touch",
  );
});

it("shows only one guide when a rider selects the Nav and then taps within the interval", () => {
  const { guide, world, command } = setup();
  guide.execute(command);
  guide.execute({ ...command, tick: command.tick + 1, trigger: "tap" });
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
    driver.id,
    "nav_open_touch",
  );
});

it.each([
  ["touch", "nav_open_touch"],
  ["mouse", "nav_open_mouse"],
  ["other", "nav_open_other"],
] as const)("shows a passenger the %s guide", (controls, key) => {
  const { guide, world, command } = setup();
  guide.execute({ ...command, playerId: passenger.id, controls });
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(passenger.id, key);
});
