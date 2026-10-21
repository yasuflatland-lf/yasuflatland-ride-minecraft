import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HitVehicle } from "../../../src/application/vehicle/hitVehicle";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { DECOR_CELLS } from "../../../src/domain/vehicle/kinds/camper/decor";
import {
  createVehicle,
  fleetLimitOf,
  rebuildVehicle,
} from "../../../src/domain/vehicle/kinds/index";
import {
  FakeClock,
  FakeFleetRepository,
  FakeWorld,
  InMemoryRepo,
  parkedCamper,
} from "./fakes";

describe("HitVehicle (ADR 0008)", () => {
  it("on the third hit, drops the item, removes the vehicle, and discards the aggregate", () => {
    const world = new FakeWorld();
    const repo = new InMemoryRepo();
    repo.save(createVehicle("suv", asVehicleId("a"), 0));
    const fleets = new FakeFleetRepository(fleetLimitOf);
    fleets.state = {
      order: ["a", "b"].map((id) => ({
        id: asVehicleId(id),
        kind: "suv" as const,
      })),
      evicted: [],
    };
    const clock = new FakeClock();
    const uc = new HitVehicle(world, repo, fleets, clock);
    expect(
      [1, 2, 3].map((tick) => {
        clock.tick = tick;
        return uc.execute({
          playerId: asPlayerId("p"),
          vehicleId: asVehicleId("a"),
          fromDeck: false,
        });
      }),
    ).toEqual([false, false, true]);
    expect(world.calls).toEqual(["drop:a", "remove:a"]);
    expect(repo.get(asVehicleId("a"))).toBeUndefined();
    // A broken vehicle no longer counts toward the limit (ADR 0038).
    expect(fleets.state.order).toEqual([{ id: "b", kind: "suv" }]);
  });

  it("never counts hits from the deck toward breaking the vehicle", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (hits) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        const vehicle = createVehicle("sportsboat", asVehicleId("a"), 0);
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
          expect(
            uc.execute({
              playerId: asPlayerId("p"),
              vehicleId: asVehicleId("a"),
              fromDeck: true,
            }),
          ).toBe(false);
          expect(world.calls).toEqual([]);
          expect(repo.get(asVehicleId("a"))).toBe(vehicle);
        }
        expect(
          [1, 2, 3].map((offset) => {
            clock.tick = hits + offset;
            return uc.execute({
              playerId: asPlayerId("p"),
              vehicleId: asVehicleId("a"),
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
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("x"),
        fromDeck: false,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });

  it("gives the placed decor to the hitter when the camper breaks (ADR 0093)", () => {
    const { car, repo } = parkedCamper();
    car.placeDecor("stove", "percolator");
    const world = new FakeWorld();
    const clock = new FakeClock();
    const uc = new HitVehicle(
      world,
      repo,
      new FakeFleetRepository(fleetLimitOf),
      clock,
    );
    expect(
      [1, 2, 3].map((tick) => {
        clock.tick = tick;
        return uc.execute({
          playerId: asPlayerId("p"),
          vehicleId: car.id,
          fromDeck: false,
        });
      }),
    ).toEqual([false, false, true]);
    expect(world.calls).toEqual([
      "drop:car",
      "giveDecor:p:percolator",
      "remove:car",
    ]);
  });

  it("gives back stowed decor when the camper breaks (ADR 0103)", () => {
    // One item per standing cell: a cell holds one item (ADR 0107).
    const standing = DECOR_CELLS.flatMap(({ slots: [first] }) =>
      first && !first.hanging ? [{ slot: first.id, item: "potted_plant" }] : [],
    );
    const saved = [
      ...standing,
      { slot: "wall_cabinet_front", item: "lava_lamp" },
      { slot: "wall_cabinet_rear", item: "toaster" },
    ];
    const repo = new InMemoryRepo();
    const car = rebuildVehicle("camper", asVehicleId("car"), 0, [], {
      dockDecor: JSON.stringify(saved),
    });
    repo.save(car);
    const world = new FakeWorld();
    const clock = new FakeClock();
    const uc = new HitVehicle(
      world,
      repo,
      new FakeFleetRepository(fleetLimitOf),
      clock,
    );
    for (const tick of [1, 2, 3]) {
      clock.tick = tick;
      uc.execute({
        playerId: asPlayerId("p"),
        vehicleId: car.id,
        fromDeck: false,
      });
    }
    expect(world.calls).toContain(
      `giveDecor:p:${saved.map((d) => d.item).join(",")}`,
    );
    expect(saved).toHaveLength(11);
  });
});
