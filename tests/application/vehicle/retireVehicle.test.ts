import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { retireVehicle } from "../../../src/application/vehicle/retireVehicle";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { Fleet } from "../../../src/domain/vehicle/fleet/fleet";
import {
  VEHICLE_KINDS,
  type VehicleKind,
} from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  fleetLimitOf,
} from "../../../src/domain/vehicle/kinds/index";
import { InMemoryRepo } from "./fakes";

function setup(kind: VehicleKind, id: string, failRemove = false) {
  const log: string[] = [];
  const world = {
    removeVehicle: (vehicleId: string) => {
      if (failRemove) throw new Error("remove");
      log.push(`world:${vehicleId}`);
    },
  };
  const repo = new InMemoryRepo();
  repo.save(createVehicle(kind, asVehicleId(id), 0));
  const repoRemove = repo.remove.bind(repo);
  repo.remove = (vehicleId: string) => {
    log.push(`repo:${vehicleId}`);
    repoRemove(asVehicleId(vehicleId));
  };
  const fleet = Fleet.empty(fleetLimitOf);
  fleet.admit({ id: asVehicleId(id), kind });
  const fleetForget = fleet.forget.bind(fleet);
  fleet.forget = (vehicleId: string) => {
    log.push(`fleet:${vehicleId}`);
    fleetForget(asVehicleId(vehicleId));
  };
  return { log, world, repo, fleet };
}

describe("retireVehicle (ADR 0008, 0038, 0066)", () => {
  it("retires in world, repository, fleet order", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        fc.string({ minLength: 1 }),
        (kind, id) => {
          const { log, world, repo, fleet } = setup(kind, id);
          retireVehicle(world, repo, fleet, asVehicleId(id));
          expect(log).toEqual([`world:${id}`, `repo:${id}`, `fleet:${id}`]);
          expect(repo.get(asVehicleId(id))).toBeUndefined();
          expect(fleet.knows(asVehicleId(id))).toBe(false);
        },
      ),
    );
  });

  it("leaves the repository and the fleet untouched when the world removal fails", () => {
    const { log, world, repo, fleet } = setup("suv", "a", true);
    expect(() => retireVehicle(world, repo, fleet, asVehicleId("a"))).toThrow(
      "remove",
    );
    expect(log).toEqual([]);
    expect(repo.get(asVehicleId("a"))).toBeDefined();
    expect(fleet.knows(asVehicleId("a"))).toBe(true);
  });
});
