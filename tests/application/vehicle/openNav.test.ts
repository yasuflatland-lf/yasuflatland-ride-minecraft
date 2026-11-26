import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { NavSelections } from "../../../src/application/vehicle/navSelections";
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
import { SPEC } from "../../../src/domain/vehicle/spec";
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
    showCreating: vi.fn<NavWorld["showCreating"]>(),
    waitTicks: vi.fn<NavWorld["waitTicks"]>().mockResolvedValue(undefined),
    giveMap: vi.fn<NavWorld["giveMap"]>().mockReturnValue("given"),
    showMessage: vi.fn<NavWorld["showMessage"]>(),
  };
  return {
    repo,
    world,
    nav: new OpenNav(repo, world, new NavSelections()),
    command: { playerId: driver.id, vehicleId },
  };
}

it("lets a passenger in any seat choose and receive a map", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (seat) => {
      const { nav, repo, world } = setup();
      const passenger = riderView("passenger", {
        offset: defined(
          profileOf("suv").seats.positions[seat],
          "passenger seat",
        ),
      });
      repo.save(rebuildVehicle("suv", vehicleId, 0, [driver, passenger], {}));
      await nav.execute({ playerId: passenger.id, vehicleId });
      expect(world.choose).toHaveBeenCalledExactlyOnceWith(passenger.id, [
        destination,
      ]);
      expect(world.giveMap).toHaveBeenCalledExactlyOnceWith(
        passenger.id,
        destination,
      );
    }),
  );
});

it("gives nothing when a passenger gets out before choosing", async () => {
  const { nav, repo, world } = setup();
  const passenger = riderView("passenger", {
    offset: defined(profileOf("suv").seats.positions[1], "passenger seat"),
  });
  repo.save(rebuildVehicle("suv", vehicleId, 0, [driver, passenger], {}));
  const pending = nav.execute({ playerId: passenger.id, vehicleId });
  repo.save(rebuildVehicle("suv", vehicleId, 0, [driver], {}));
  await pending;
  expect(world.showCreating).not.toHaveBeenCalled();
  expect(world.giveMap).not.toHaveBeenCalled();
  expect(world.showMessage).not.toHaveBeenCalled();
});

it("refuses a rider of a different vehicle", async () => {
  const { nav, repo, world } = setup();
  const passenger = riderView("passenger", {
    offset: defined(profileOf("suv").seats.positions[1], "passenger seat"),
  });
  repo.save(
    rebuildVehicle("suv", asVehicleId("other"), 0, [driver, passenger], {}),
  );
  await nav.execute({ playerId: passenger.id, vehicleId });
  expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
    passenger.id,
    "nav_riding_only",
  );
  expect(world.choose).not.toHaveBeenCalled();
});

it.each([vehicleId, undefined])(
  "refuses a player on foot before looking up the dimension or opening a menu (%s)",
  async (id) => {
    const { nav, world } = setup();
    const playerId = asPlayerId("not-driver");
    await nav.execute({ vehicleId: id, playerId });
    expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
      playerId,
      "nav_riding_only",
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
  "announces the destination and waits before delivering the map for %s",
  async (result) => {
    const { nav, world, command } = setup();
    world.giveMap.mockReturnValue(result);
    await nav.execute(command);
    expect(world.choose).toHaveBeenCalledExactlyOnceWith(driver.id, [
      destination,
    ]);
    expect(world.showCreating).toHaveBeenCalledExactlyOnceWith(
      driver.id,
      destination,
    );
    expect(world.waitTicks).toHaveBeenCalledExactlyOnceWith(SPEC.navMapDelay);
    expect(world.choose).toHaveBeenCalledBefore(world.showCreating);
    expect(world.showCreating).toHaveBeenCalledBefore(world.waitTicks);
    expect(world.waitTicks).toHaveBeenCalledBefore(world.giveMap);
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
  expect(world.showCreating).not.toHaveBeenCalled();
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
  expect(world.showCreating).not.toHaveBeenCalled();
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

it("skips delivery and the miss message if the rider gets out during the wait", async () => {
  const { nav, repo, world, command } = setup();
  world.giveMap.mockReturnValue("nothing");
  world.waitTicks.mockImplementationOnce(async () => {
    repo.save(rebuildVehicle("suv", vehicleId, 0, [], {}));
  });
  await nav.execute(command);
  expect(world.showCreating).toHaveBeenCalledExactlyOnceWith(
    driver.id,
    destination,
  );
  expect(world.giveMap).not.toHaveBeenCalled();
  expect(world.showMessage).not.toHaveBeenCalled();
});

it("ignores another press until the map delay ends", async () => {
  const { nav, world, command } = setup();
  let finishWait = () => {};
  world.waitTicks.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishWait = resolve;
    }),
  );
  const pending = nav.execute(command);
  await Promise.resolve();
  expect(world.waitTicks).toHaveBeenCalledOnce();
  await nav.execute(command);
  expect(world.choose).toHaveBeenCalledOnce();
  expect(world.giveMap).not.toHaveBeenCalled();
  finishWait();
  await pending;
  expect(world.giveMap).toHaveBeenCalledExactlyOnceWith(driver.id, destination);
});
