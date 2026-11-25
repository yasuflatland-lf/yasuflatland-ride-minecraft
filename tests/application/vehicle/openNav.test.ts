import { expect, it, vi } from "vitest";
import { OpenNav } from "../../../src/application/vehicle/openNav";
import type { NavWorld } from "../../../src/application/vehicle/ports/drive";
import {
  asDimensionId,
  asPlayerId,
  asVehicleId,
} from "../../../src/domain/shared/ids";
import {
  profileOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import type { NavDestination } from "../../../src/domain/vehicle/navigation/destinations";
import { defined } from "../../support/defined";
import { riderView } from "../../support/riders";
import { InMemoryRepo } from "./fakes";

// Exercise the choice flow independently of Bedrock's confirmed destination list.
const destination = vi.hoisted(() => "test_destination" as NavDestination);
vi.mock("../../../src/domain/vehicle/navigation/destinations", () => ({
  NAV_DESTINATIONS: [destination],
}));
const vehicleId = asVehicleId("suv");
const driver = riderView("driver", {
  offset: defined(profileOf("suv").seats.positions[0], "driver seat"),
});

function setup() {
  const repo = new InMemoryRepo();
  repo.save(rebuildVehicle("suv", vehicleId, 0, [driver], {}));
  const world = {
    dimensionOf: vi.fn<NavWorld["dimensionOf"]>(() =>
      asDimensionId("minecraft:overworld"),
    ),
    choose: vi.fn<NavWorld["choose"]>().mockResolvedValue(destination),
    giveMap: vi.fn<NavWorld["giveMap"]>().mockReturnValue("given"),
    showMessage: vi.fn<NavWorld["showMessage"]>(),
  };
  return {
    repo,
    world,
    nav: new OpenNav(repo, world),
    command: { playerId: driver.id, vehicleId },
  };
}

it.each([vehicleId, undefined])(
  "refuses a non-driver before looking up the dimension or opening a menu (%s)",
  async (id) => {
    const { nav, world } = setup();
    const playerId = asPlayerId("not-driver");
    await nav.execute({ vehicleId: id, playerId });
    expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
      playerId,
      "nav_driver_only",
    );
    expect(world.dimensionOf).not.toHaveBeenCalled();
    expect(world.choose).not.toHaveBeenCalled();
  },
);

it("refuses a driver outside the Overworld before opening a menu", async () => {
  const { nav, world, command } = setup();
  world.dimensionOf.mockReturnValue(asDimensionId("minecraft:nether"));
  await nav.execute(command);
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
    driver.id,
    "nav_overworld_only",
  );
  expect(world.choose).not.toHaveBeenCalled();
});

it.each(["given", "unknown"] as const)(
  "gives the chosen map once and stays silent for %s",
  async (result) => {
    const { nav, world, command } = setup();
    world.giveMap.mockReturnValue(result);
    await nav.execute(command);
    expect(world.choose).toHaveBeenCalledExactlyOnceWith(driver.id, [
      destination,
    ]);
    expect(world.giveMap).toHaveBeenCalledExactlyOnceWith(
      driver.id,
      destination,
    );
    expect(world.showMessage).not.toHaveBeenCalled();
  },
);

it("gives nothing when the driver cancels", async () => {
  const { nav, world, command } = setup();
  world.choose.mockResolvedValue(undefined);
  await nav.execute(command);
  expect(world.giveMap).not.toHaveBeenCalled();
  expect(world.showMessage).not.toHaveBeenCalled();
});

it("gives nothing when the driver moves to another vehicle while choosing", async () => {
  const { nav, repo, world, command } = setup();
  const pending = nav.execute(command);
  expect(world.choose).toHaveBeenCalledOnce();
  repo.save(rebuildVehicle("suv", vehicleId, 0, [], {}));
  repo.save(rebuildVehicle("suv", asVehicleId("other"), 0, [driver], {}));
  await pending;
  expect(world.giveMap).not.toHaveBeenCalled();
  expect(world.showMessage).not.toHaveBeenCalled();
});

it("reports a detectable search miss", async () => {
  const { nav, world, command } = setup();
  world.giveMap.mockReturnValue("nothing");
  await nav.execute(command);
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
    driver.id,
    "nav_nothing_found",
  );
});

it("ignores a second press while choosing and allows the next press after cancellation", async () => {
  const { nav, world, command } = setup();
  let cancel = () => {};
  world.choose.mockReturnValueOnce(
    new Promise((resolve) => {
      cancel = () => resolve(undefined);
    }),
  );
  const pending = nav.execute(command);
  await nav.execute(command);
  expect(world.choose).toHaveBeenCalledOnce();
  cancel();
  await pending;
  await nav.execute(command);
  expect(world.choose).toHaveBeenCalledTimes(2);
  expect(world.giveMap).toHaveBeenCalledExactlyOnceWith(driver.id, destination);
});
