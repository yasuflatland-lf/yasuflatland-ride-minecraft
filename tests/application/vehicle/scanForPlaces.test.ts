import fc from "fast-check";
import { expect, it, vi } from "vitest";
import type { RadarWorld } from "../../../src/application/vehicle/ports/drive";
import { ScanForPlaces } from "../../../src/application/vehicle/scanForPlaces";
import {
  asDimensionId,
  asVehicleId,
  type VehicleId,
} from "../../../src/domain/shared/ids";
import { rebuildVehicle } from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { riderView } from "../../support/riders";
import { InMemoryRepo } from "./fakes";

const OVERWORLD = asDimensionId("minecraft:overworld");
const NETHER = asDimensionId("minecraft:nether");
const at = (x: number) => ({ x, y: 64, z: 0 });

function fixture() {
  const repo = new InMemoryRepo();
  const positions = new Map<
    VehicleId,
    NonNullable<ReturnType<RadarWorld["position"]>>
  >();
  const world = {
    position: vi.fn<RadarWorld["position"]>((id) => positions.get(id)),
    mobsNear: vi.fn<RadarWorld["mobsNear"]>((_dimensionId, center) => [
      { typeId: "minecraft:villager_v2", location: at(center.x + 30) },
    ]),
    isQuiet: vi.fn<RadarWorld["isQuiet"]>(() => true),
    showReport: vi.fn<RadarWorld["showReport"]>(),
  };
  const radar = new ScanForPlaces(world, repo);
  function add(rawId: string, driver?: string, x = 0, passenger?: string) {
    const id = asVehicleId(rawId);
    const riders = driver === undefined ? [] : [riderView(driver)];
    if (passenger !== undefined) riders.push(riderView(passenger, { seat: 1 }));
    repo.save(rebuildVehicle("suv", id, 0, riders, {}));
    positions.set(id, { dimensionId: OVERWORLD, location: at(x) });
    return id;
  }
  return { repo, positions, world, radar, add };
}

it("scans one occupied vehicle per call in round robin order", () => {
  const { radar, add, world } = fixture();
  add("a", "first", 100);
  add("parked", undefined, 200);
  add("b", undefined, 300, "passenger");
  for (const x of [100, 300, 100]) {
    world.mobsNear.mockClear();
    radar.execute();
    expect(world.mobsNear).toHaveBeenCalledExactlyOnceWith(
      OVERWORLD,
      at(x),
      SPEC.radarRadius,
      expect.arrayContaining(["minecraft:villager_v2", "minecraft:witch"]),
    );
  }
});

it("reports to a passenger in a vehicle without a driver", () => {
  const { radar, add, world } = fixture();
  add("a", undefined, 0, "passenger");
  radar.execute();
  expect(world.showReport).toHaveBeenCalledExactlyOnceWith("passenger", {
    place: "village",
    direction: "e",
    distance: 30,
  });
});

it("reports the same place once to both riders and reads their vehicle position once per run", () => {
  const { radar, add, world } = fixture();
  const occupied = add("a", "driver", 0, "passenger");
  const other = add("b", "other", 300);
  radar.execute();
  expect(world.position.mock.calls).toEqual([[occupied]]);
  const report = { place: "village", direction: "e", distance: 30 };
  expect(world.showReport.mock.calls).toEqual([
    ["driver", report],
    ["passenger", report],
  ]);

  world.position.mockClear();
  radar.execute();
  expect(world.position.mock.calls).toHaveLength(2);
  expect(world.position).toHaveBeenCalledWith(occupied);
  expect(world.position).toHaveBeenCalledWith(other);
  radar.execute();
  expect(world.showReport.mock.calls).toEqual([
    ["driver", report],
    ["passenger", report],
    ["other", report],
  ]);
});

it("lets either rider receive a report while the other rider's bar is busy", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("driver", "passenger"),
      fc.integer({ min: 1, max: 5 }),
      (busy, scans) => {
        const { radar, add, world } = fixture();
        add("a", "driver", 0, "passenger");
        const quiet = busy === "driver" ? "passenger" : "driver";
        world.isQuiet.mockImplementation((id) => id !== busy);
        for (let scan = 0; scan < scans; scan++) radar.execute();
        const report = { place: "village", direction: "e", distance: 30 };
        expect(world.showReport).toHaveBeenCalledExactlyOnceWith(quiet, report);

        world.mobsNear.mockReturnValue([]);
        world.isQuiet.mockReturnValue(true);
        radar.execute();
        expect(world.showReport.mock.calls).toEqual([
          [quiet, report],
          [busy, report],
        ]);
      },
    ),
  );
});

it("clears only the rider who gets out, even if that rider was the driver", () => {
  const { radar, add, world } = fixture();
  add("a", "driver", 0, "passenger");
  radar.execute();
  expect(world.showReport.mock.calls.map(([rider]) => rider)).toEqual([
    "driver",
    "passenger",
  ]);
  add("a", undefined, 0, "passenger");
  radar.execute();
  expect(world.showReport).toHaveBeenCalledTimes(2);
  add("a", "driver", 0, "passenger");
  radar.execute();
  expect(world.showReport.mock.calls.map(([rider]) => rider)).toEqual([
    "driver",
    "passenger",
    "driver",
  ]);
});

it("does not scan a vehicle with no riders", () => {
  const { radar, add, world } = fixture();
  add("parked");
  radar.execute();
  expect(world.position).not.toHaveBeenCalled();
  expect(world.mobsNear).not.toHaveBeenCalled();
});

it("holds a report while the bar is busy and delivers it on a later vehicle's scan", () => {
  const { radar, add, world, positions } = fixture();
  const first = add("a", "first");
  add("b", "second", 300);
  world.isQuiet.mockReturnValue(false);
  radar.execute();
  expect(world.showReport).not.toHaveBeenCalled();
  positions.set(first, { dimensionId: OVERWORLD, location: at(50) });
  world.isQuiet.mockImplementation((id) => id === "first");
  radar.execute();
  expect(world.showReport).toHaveBeenCalledExactlyOnceWith("first", {
    place: "village",
    direction: "w",
    distance: 20,
  });
});

it("lets the new driver hear places that the previous driver heard", () => {
  const { radar, add, world } = fixture();
  add("a", "first");
  radar.execute();
  add("a", "next");
  radar.execute();
  expect(world.showReport.mock.calls.map(([id]) => id)).toEqual([
    "first",
    "next",
  ]);
});

it("skips an unknown vehicle position", () => {
  const { radar, add, world, positions } = fixture();
  positions.delete(add("a", "first"));
  radar.execute();
  expect(world.mobsNear).not.toHaveBeenCalled();
  expect(world.showReport).not.toHaveBeenCalled();
});

it("forgets a removed vehicle and a vehicle whose driver got out", () => {
  const { radar, add, repo, world } = fixture();
  const a = add("a", "first");
  radar.execute();
  repo.remove(a);
  radar.execute();
  add("a", "first");
  radar.execute();
  add("a");
  radar.execute();
  add("a", "first");
  radar.execute();
  expect(world.showReport).toHaveBeenCalledTimes(3);
});

it("keeps markers in their own dimension during the same drive", () => {
  const { radar, add, positions, world } = fixture();
  const id = add("a", "first");
  radar.execute();
  positions.set(id, { dimensionId: NETHER, location: at(0) });
  radar.execute();
  positions.set(id, { dimensionId: OVERWORLD, location: at(0) });
  radar.execute();
  expect(world.showReport).toHaveBeenCalledTimes(2);
});
