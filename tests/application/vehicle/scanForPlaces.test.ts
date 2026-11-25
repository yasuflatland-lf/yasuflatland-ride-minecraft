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
  function add(rawId: string, driver?: string, x = 0) {
    const id = asVehicleId(rawId);
    const vehicle = rebuildVehicle(
      "suv",
      id,
      0,
      driver ? [riderView(driver)] : [],
      {},
    );
    repo.save(vehicle);
    positions.set(id, { dimensionId: OVERWORLD, location: at(x) });
    return id;
  }
  return { repo, positions, world, radar, add };
}

it("scans one driven vehicle per call in round robin order", () => {
  const { radar, add, world } = fixture();
  add("a", "first", 100);
  add("parked", undefined, 200);
  add("b", "second", 300);
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
