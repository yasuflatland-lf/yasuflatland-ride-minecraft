import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HitVehicle } from "../../../src/application/vehicle/hitVehicle";
import {
  createVehicle,
  fleetLimitOf,
} from "../../../src/domain/vehicle/kinds/index";
import {
  FakeClock,
  FakeFleetRepository,
  FakeWorld,
  InMemoryRepo,
} from "./fakes";

describe("HitVehicle (ADR 0008)", () => {
  it("on the third hit, drops the item, removes the vehicle, and discards the aggregate", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", "a", 0));
    const fleets = new FakeFleetRepository(fleetLimitOf);
    fleets.state = {
      order: ["a", "b"].map((id) => ({ id, kind: "suv" as const })),
      evicted: [],
    };
    const clock = new FakeClock();
    const uc = new HitVehicle(world, repo, fleets, clock);
    expect(
      [1, 2, 3].map((tick) => {
        clock.tick = tick;
        return uc.execute({ vehicleId: "a", fromDeck: false });
      }),
    ).toEqual([false, false, true]);
    expect(world.calls).toEqual(["drop:a", "remove:a"]);
    expect(repo.get("a")).toBeUndefined();
    // A broken vehicle no longer counts toward the limit (ADR 0038).
    expect(fleets.state.order).toEqual([{ id: "b", kind: "suv" }]);
  });

  it("never counts hits from the deck toward breaking the vehicle", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (hits) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        const vehicle = createVehicle("sportsboat", "a", 0);
        repo.save(vehicle);
        const clock = new FakeClock();
        const uc = new HitVehicle(
          world,
          repo,
          new FakeFleetRepository(fleetLimitOf),
          clock,
        );
        for (let tick = 1; tick <= hits; tick++) {
          clock.tick = tick;
          expect(uc.execute({ vehicleId: "a", fromDeck: true })).toBe(false);
          expect(world.calls).toEqual([]);
          expect(repo.get("a")).toBe(vehicle);
        }
        expect(
          [1, 2, 3].map((offset) => {
            clock.tick = hits + offset;
            return uc.execute({
              vehicleId: "a",
              fromDeck: false,
            });
          }),
        ).toEqual([false, false, true]);
      }),
    );
  });

  it("does nothing for a vehicle not in the repository", () => {
    const world = new FakeWorld();
    const clock = new FakeClock();
    expect(
      new HitVehicle(
        world,
        new InMemoryRepo(),
        new FakeFleetRepository(fleetLimitOf),
        clock,
      ).execute({
        vehicleId: "x",
        fromDeck: false,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});
