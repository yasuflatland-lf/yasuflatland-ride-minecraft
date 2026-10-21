import { describe, expect, it } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import { createVehicle } from "../../../../src/domain/vehicle/kinds/index";
import { InMemoryVehicleRepository } from "../../../../src/infrastructure/vehicle/persistence/inMemoryVehicleRepository";

describe("InMemoryVehicleRepository", () => {
  it("saves, gets, deletes, and lists", () => {
    const repo = new InMemoryVehicleRepository();
    repo.save(createVehicle("suv", asVehicleId("a"), 0));
    repo.save(createVehicle("suv", asVehicleId("b"), 0));
    expect(repo.get(asVehicleId("a"))?.id).toBe("a");
    repo.remove(asVehicleId("a"));
    expect(repo.get(asVehicleId("a"))).toBeUndefined();
    expect(repo.ids()).toEqual(["b"]);
  });
});
