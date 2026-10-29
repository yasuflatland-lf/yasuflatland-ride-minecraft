import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LimitVehicles } from "../../../src/application/vehicle/limitVehicles";
import { retireVehicle } from "../../../src/application/vehicle/retireVehicle";
import {
  asPlayerId,
  asVehicleId,
  type VehicleId,
} from "../../../src/domain/shared/ids";
import {
  Fleet,
  type FleetEntry,
} from "../../../src/domain/vehicle/fleet/fleet";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  fleetLimitOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { FakeFleetRepository, FakeWorld, InMemoryRepo } from "./fakes";

const entry = (id: string) => ({ id: asVehicleId(id), kind: "suv" as const });
const entries = (ids: string[]) => ids.map(entry);

const ids = (n: number) => Array.from({ length: n }, (_, i) => `v${i}`);
const full = ids(SPEC.maxUnownedVehicles);

function setup() {
  const world = new FakeWorld();
  const repo = new InMemoryRepo();
  const fleets = new FakeFleetRepository(fleetLimitOf);
  const warnings: string[] = [];
  const log = { warn: (m: string) => warnings.push(m) };
  return {
    world,
    repo,
    fleets,
    warnings,
    uc: new LimitVehicles(world, repo, fleets, log),
  };
}

describe("LimitVehicles (ADR 0038)", () => {
  it("removes the oldest loaded vehicle when a new one spawns over the limit", () => {
    const { world, repo, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    repo.save(createVehicle("suv", asVehicleId("v0"), 0));
    world.loaded = entries([...full, "new"]);
    uc.spawned(entry("new"));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(repo.get(asVehicleId("v0"))).toBeUndefined();
    expect(fleets.state.order).toEqual(entries([...full.slice(1), "new"]));
    expect(fleets.state.evicted).toEqual([]);
  });

  it("removes nothing else when several spawn in one tick before their events arrive", () => {
    const { world, fleets, uc } = setup();
    const cars = ids(SPEC.maxUnownedVehicles + 1);
    world.loaded = entries(cars);
    for (const id of cars) uc.spawned(entry(id));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.order).toEqual(entries(cars.slice(1)));
  });

  it("removes an evicted vehicle in an unloaded chunk when its chunk loads", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    world.loaded = entries(["new"]);
    uc.spawned(entry("new"));
    expect(world.calls).toEqual([]);
    expect(fleets.state.evicted).toEqual(entries(["v0"]));

    world.loaded = entries(["new", "v0"]);
    uc.found(entries(["v0"]));
    expect(world.calls).toEqual(["remove:v0"]);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("trims a world that already has more vehicles than the limit", () => {
    const { world, repo, fleets, uc } = setup();
    world.loaded = entries(ids(SPEC.maxUnownedVehicles + 3));
    for (const { id } of world.loaded) repo.save(createVehicle("suv", id, 0));
    uc.start();
    // Within one scan a later id counts as older, so the last three go.
    const removed = world.loaded
      .slice(SPEC.maxUnownedVehicles)
      .map((entry) => entry.id);
    expect(world.calls).toEqual(removed.map((id) => `remove:${id}`));
    expect(removed.map((id) => repo.get(id))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(fleets.state.order).toHaveLength(SPEC.maxUnownedVehicles);
    expect(fleets.state.evicted).toEqual([]);
  });

  it("keeps removing the others and saves the fleet when one removal fails", () => {
    const { world, fleets, warnings, uc } = setup();
    const cars = ids(SPEC.maxUnownedVehicles + 2);
    fleets.state = { order: entries(cars.slice(0, -1)), evicted: [] };
    world.loaded = entries(cars);
    world.failRemoveOn = "v0";
    uc.spawned(entry(cars[cars.length - 1] as string));
    expect(world.calls).toEqual(["remove:v1"]);
    expect(fleets.state.evicted).toEqual(entries(["v0"]));
    expect(warnings.some((w) => w.includes("v0"))).toBe(true);
    expect(warnings.some((w) => w.includes("v1"))).toBe(true);
  });

  it("counts a vehicle it never saw spawn as older than the ones it did", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    world.loaded = entries([...full, "found"]);
    uc.found(entries(["found"]));
    expect(world.calls).toEqual(["remove:found"]);
    expect(fleets.state.order).toEqual(entries(full));
  });

  it("does not save when it finds only known vehicles", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(["a"]), evicted: [] };
    world.loaded = entries(["a"]);
    uc.found(entries(["a"]));
    expect(fleets.saves).toBe(0);
  });

  it("saves the vehicles it finds for the first time even when none is over the limit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: SPEC.maxUnownedVehicles }), (n) => {
        const { world, fleets, uc } = setup();
        world.loaded = entries(ids(n));
        uc.found(entries(ids(n)));
        expect(world.calls).toEqual([]);
        expect(fleets.saves).toBe(1);
        // Within one scan a later id counts as older.
        expect(fleets.state.order).toEqual(entries(ids(n).reverse()));
      }),
    );
  });
  it("removes the loaded first boat when its owner spawns a second, leaving other owners and kinds alone", () => {
    const { world, repo, fleets, warnings, uc } = setup();
    const first = {
      id: asVehicleId("first"),
      kind: "sportsboat" as const,
      owner: asPlayerId("a"),
    };
    const second = {
      id: asVehicleId("second"),
      kind: "sportsboat" as const,
      owner: asPlayerId("a"),
    };
    const other = {
      id: asVehicleId("other"),
      kind: "sportsboat" as const,
      owner: asPlayerId("b"),
    };
    const suv = {
      id: asVehicleId("suv"),
      kind: "suv" as const,
      owner: asPlayerId("a"),
    };
    fleets.state = { order: [first, other, suv], evicted: [] };
    world.loaded = [first, other, suv, second];
    for (const e of world.loaded) repo.save(createVehicle(e.kind, e.id, 0));
    uc.spawned(second);
    expect(world.calls).toEqual(["remove:first"]);
    expect(repo.get(first.id)).toBeUndefined();
    for (const e of [other, suv, second]) expect(repo.get(e.id)).toBeDefined();
    expect(fleets.state).toEqual({ order: [other, suv, second], evicted: [] });
    expect(warnings).toEqual(["first: removed, over the limit"]);
  });
});

// A fleet history with owned and unowned groups, evictions and take-backs.
const history = fc
  .array(
    fc.record({
      op: fc.constantFrom("admit", "admitAsOldest", "forget"),
      id: fc.nat(40).map((n) => asVehicleId(`v${n}`)),
      kind: fc.constantFrom(...VEHICLE_KINDS),
      owner: fc
        .option(fc.constantFrom("p0", "p1"), { nil: undefined })
        .map((o) => (o === undefined ? undefined : asPlayerId(o))),
    }),
    { maxLength: 120 },
  )
  .map((steps) => {
    const fleet = Fleet.empty(fleetLimitOf);
    for (const { op, ...entry } of steps) {
      if (op === "forget") fleet.forget(entry.id);
      else fleet[op](entry);
    }
    return fleet.state();
  });

const knownIds = (state: ReturnType<Fleet["state"]>) => [
  ...state.order.map((e) => e.id),
  ...state.evicted.map((e) => e.id),
];

// Fresh ids never appear in a history, whose ids are v0 to v40.
const freshId = fc.nat(40).map((n) => asVehicleId(`fresh${n}`));

const withKnownId = history
  .filter((state) => knownIds(state).length > 0)
  .chain((state) =>
    fc.record({
      state: fc.constant(state),
      id: fc.constantFrom(...knownIds(state)),
    }),
  );

const withAnyId = history.chain((state) =>
  fc.record({
    state: fc.constant(state),
    id:
      knownIds(state).length > 0
        ? fc.oneof(fc.constantFrom(...knownIds(state)), freshId)
        : freshId,
  }),
);

const withOrderEntry = history
  .filter((state) => state.order.length > 0)
  .chain((state) =>
    fc.record({
      state: fc.constant(state),
      entry: fc.constantFrom(...state.order),
    }),
  );

const withTwoKnownIds = history
  .filter((state) => new Set(knownIds(state)).size > 1)
  .chain((state) =>
    fc.record({
      state: fc.constant(state),
      pair: fc
        .tuple(
          fc.constantFrom(...knownIds(state)),
          fc.constantFrom(...knownIds(state)),
        )
        .filter(([id, other]) => id !== other),
    }),
  );

const withEvictionAndOrderEntry = history
  .filter((state) => state.order.length > 0 && state.evicted.length > 0)
  .chain((state) =>
    fc.record({
      state: fc.constant(state),
      entry: fc.constantFrom(...state.order),
    }),
  );

function setupWith(state: ReturnType<Fleet["state"]>) {
  const s = setup();
  s.fleets.state = state;
  s.fleets.saves = 0;
  return s;
}

const forgotten = (state: ReturnType<Fleet["state"]>, id: VehicleId) => {
  const fleet = Fleet.restore(state, fleetLimitOf);
  fleet.forget(id);
  return fleet.state();
};

describe("LimitVehicles removal (ADR 0125)", () => {
  it("forgets a known vehicle removed from a loaded chunk as Fleet.forget does", () => {
    fc.assert(
      fc.property(withKnownId, ({ state, id }) => {
        const { world, fleets, uc } = setupWith(state);
        uc.removed(id, true);
        expect(fleets.state).toEqual(forgotten(state, id));
        expect(fleets.saves).toBe(1);
        expect(world.calls).toEqual([]);
      }),
    );
  });

  it("keeps the fleet when a vehicle that did not die is removed from an unloaded chunk", () => {
    fc.assert(
      fc.property(withAnyId, ({ state, id }) => {
        const { fleets, uc } = setupWith(state);
        uc.removed(id, false);
        expect(fleets.state).toEqual(state);
        expect(fleets.saves).toBe(0);
      }),
    );
  });

  it("forgets a known vehicle that died before its removal even when the chunk read says unloaded", () => {
    fc.assert(
      fc.property(withKnownId, ({ state, id }) => {
        const { fleets, uc } = setupWith(state);
        uc.died(id);
        uc.removed(id, false);
        expect(fleets.state).toEqual(forgotten(state, id));
        expect(fleets.saves).toBe(1);
      }),
    );
  });

  it("changes nothing on a death alone, nor on the unloaded removal of another known vehicle", () => {
    fc.assert(
      fc.property(withTwoKnownIds, ({ state, pair: [id, other] }) => {
        const { fleets, uc } = setupWith(state);
        uc.died(id);
        expect(fleets.state).toEqual(state);
        expect(fleets.saves).toBe(0);
        uc.removed(other, false);
        expect(fleets.state).toEqual(state);
        expect(fleets.saves).toBe(0);
      }),
    );
  });

  it("retries the loaded evicted vehicles when it forgets a removed one", () => {
    fc.assert(
      fc.property(withEvictionAndOrderEntry, ({ state, entry }) => {
        const { world, fleets, uc } = setupWith(state);
        world.loaded = state.evicted.map(({ id }) => ({ id, kind: "suv" }));
        const fleet = Fleet.restore(state, fleetLimitOf);
        fleet.forget(entry.id);
        const retried = state.evicted
          .map((e) => e.id)
          .filter((id) => fleet.isEvicted(id));
        for (const id of retried) fleet.forget(id);
        uc.removed(entry.id, true);
        expect(world.calls).toEqual(retried.map((id) => `remove:${id}`));
        expect(fleets.state).toEqual(fleet.state());
        expect(fleets.saves).toBe(1);
      }),
    );
  });

  it("uses a death record for one removal only", () => {
    fc.assert(
      fc.property(withOrderEntry, ({ state, entry }) => {
        const { fleets, uc } = setupWith(state);
        uc.died(entry.id);
        uc.removed(entry.id, true);
        uc.found([entry]);
        const readmitted = fleets.state;
        const saves = fleets.saves;
        uc.removed(entry.id, false);
        expect(fleets.state).toEqual(readmitted);
        expect(fleets.saves).toBe(saves);
      }),
    );
  });

  it("does not record the death of a vehicle the fleet does not know", () => {
    fc.assert(
      fc.property(history, freshId, (state, id) => {
        const { fleets, uc } = setupWith(state);
        const entry: FleetEntry = { id, kind: "suv" };
        uc.died(id);
        uc.found([entry]);
        const admitted = fleets.state;
        const saves = fleets.saves;
        uc.removed(id, false);
        expect(fleets.state).toEqual(admitted);
        expect(fleets.saves).toBe(saves);
      }),
    );
  });

  it("ignores the removal of a vehicle the fleet does not know", () => {
    fc.assert(
      fc.property(
        history,
        freshId,
        fc.boolean(),
        fc.boolean(),
        (state, id, chunkLoaded, died) => {
          const { world, fleets, uc } = setupWith(state);
          if (died) uc.died(id);
          uc.removed(id, chunkLoaded);
          expect(fleets.state).toEqual(state);
          expect(fleets.saves).toBe(0);
          expect(world.calls).toEqual([]);
        },
      ),
    );
  });

  it("forgets a vehicle once when its removal arrives twice", () => {
    fc.assert(
      fc.property(withKnownId, ({ state, id }) => {
        const { fleets, uc } = setupWith(state);
        uc.removed(id, true);
        uc.removed(id, true);
        expect(fleets.state).toEqual(forgotten(state, id));
        expect(fleets.saves).toBe(1);
      }),
    );
  });

  it("keeps the place of a vehicle whose chunk unloaded when it loads again", () => {
    fc.assert(
      fc.property(withOrderEntry, ({ state, entry }) => {
        const { fleets, uc } = setupWith(state);
        uc.removed(entry.id, false);
        uc.found([entry]);
        expect(fleets.state).toEqual(state);
      }),
    );
  });

  it("changes nothing on the removal event of a vehicle broken by hand or evicted", () => {
    fc.assert(
      fc.property(withKnownId, ({ state, id }) => {
        const { world, repo, fleets, uc } = setupWith(state);
        const fleet = fleets.load();
        retireVehicle(world, repo, fleet, id);
        fleets.save(fleet);
        const retired = fleets.state;
        uc.removed(id, true);
        expect(fleets.state).toEqual(retired);
        expect(fleets.saves).toBe(1);
      }),
    );

    const { world, repo, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    repo.save(createVehicle("suv", asVehicleId("v0"), 0));
    world.loaded = entries([...full, "new"]);
    uc.spawned(entry("new"));
    const evicted = fleets.state;
    const saves = fleets.saves;
    uc.removed(asVehicleId("v0"), true);
    expect(fleets.state).toEqual(evicted);
    expect(fleets.saves).toBe(saves);
  });

  it("frees the slot of an SUV killed in a full unowned group and takes back the latest eviction", () => {
    const { world, fleets, uc } = setup();
    fleets.state = { order: entries(full), evicted: [] };
    uc.spawned(entry("new"));
    expect(fleets.state.evicted).toEqual(entries(["v0"]));
    expect(world.calls).toEqual([]);

    uc.died(asVehicleId("v5"));
    uc.removed(asVehicleId("v5"), false);
    expect(fleets.state.evicted).toEqual([]);
    expect(fleets.state.order).toEqual(
      entries(["v0", ...full.slice(1).filter((id) => id !== "v5"), "new"]),
    );
  });
});
