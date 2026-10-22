import type { Entity, Player } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import {
  asPlayerId,
  asVehicleId,
  type PlayerId,
} from "../../../../src/domain/shared/ids";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import {
  ENTITY_TYPE,
  SEAT_FILLER_TYPE,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  removeOrphanSeatFiller,
  SeatFillers,
  vehicleOfSeatFiller,
} from "../../../../src/infrastructure/vehicle/bedrock/seatFillers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

const SEATS = 4;
const PLAYERS = ["p0", "p1", "p2", "p3", "p4"] as const;

interface Fake {
  id: string;
  typeId: string;
  isValid: boolean;
  location: Vec3;
  dimension: { id: string; spawnEntity: ReturnType<typeof vi.fn> };
  mount: Fake | undefined;
  riders: Fake[];
  remove: ReturnType<typeof vi.fn>;
  getComponent(name: string): unknown;
}

/**
 * A vehicle whose rider list behaves as Bedrock's: riders are added at the end and seated
 * by index (ADR 0019), and a rider that got off is not taken back by the same vehicle
 * until the tick ends (in-game test boat_seat_fillers, ADR 0120).
 */
function fixture() {
  const entities = new Map<string, Fake>();
  const gotOff = new Set<string>();
  let next = 0;
  const dimension = {
    id: "overworld",
    spawnEntity: vi.fn((typeId: string, at: Vec3) =>
      make(`spawned${next++}`, typeId, at),
    ),
  };
  function make(id: string, typeId: string, at: Vec3 = origin): Fake {
    const fake: Fake = {
      id,
      typeId,
      isValid: true,
      location: at,
      dimension,
      mount: undefined,
      riders: [],
      remove: vi.fn(() => {
        fake.mount?.riders.splice(fake.mount.riders.indexOf(fake), 1);
        fake.mount = undefined;
        fake.isValid = false;
        entities.delete(id);
      }),
      getComponent: (name: string) => {
        if (name === "minecraft:riding")
          return fake.mount ? { entityRidingOn: fake.mount } : undefined;
        if (name === "minecraft:health") return { currentValue: 20 };
        if (name === "minecraft:rideable" && fake.typeId !== SEAT_FILLER_TYPE)
          return {
            seatCount: SEATS,
            getRiders: () => [...fake.riders],
            addRider: (rider: Fake) => {
              if (
                rider.mount ||
                fake.riders.length >= SEATS ||
                gotOff.has(`${fake.id}/${rider.id}`)
              )
                return false;
              fake.riders.push(rider);
              rider.mount = fake;
              return true;
            },
            ejectRider: (rider: Fake) => {
              const at = fake.riders.indexOf(rider);
              if (at < 0) return;
              fake.riders.splice(at, 1);
              rider.mount = undefined;
              gotOff.add(`${fake.id}/${rider.id}`);
            },
          };
        return undefined;
      },
    };
    entities.set(id, fake);
    return fake;
  }
  const origin = { x: 0, y: 64, z: 0 };
  const vehicle = make("boat", ENTITY_TYPE.sportsboat);
  const players = new Map<string, Fake>(
    PLAYERS.map((id) => [
      id,
      make(id, "minecraft:player", { x: 2, y: 64, z: 0 }),
    ]),
  );
  game.getEntity.mockImplementation((id: string) => entities.get(id));
  const endTick = () => gotOff.clear();
  return { vehicle, players, make, entities, dimension, endTick };
}

type Fixture = ReturnType<typeof fixture>;

function seat(f: Fixture, entries: readonly (string | undefined)[]): void {
  for (const [i, entry] of entries.entries()) {
    const rider = entry
      ? (f.players.get(entry) as Fake)
      : f.make(`old${i}`, SEAT_FILLER_TYPE);
    f.vehicle.riders.push(rider);
    rider.mount = f.vehicle;
  }
}

function layOn(
  f: Fixture,
  fillers: SeatFillers,
  layout: readonly (PlayerId | undefined)[],
): void {
  fillers.lay(
    asVehicleId("boat"),
    asEntity(f.vehicle),
    layout,
    (id) => f.players.get(id) as unknown as Player,
  );
}

/** Every seat filler in the world, riding or not. */
const fillersIn = (f: Fixture) =>
  [...f.entities.values()].filter((e) => e.typeId === SEAT_FILLER_TYPE);

const asEntity = (fake: Fake) => fake as unknown as Entity;

/** What the rider list holds, with "F" for a seat filler. */
function listOf(vehicle: Fake): string[] {
  return vehicle.riders.map((r) =>
    r.typeId === SEAT_FILLER_TYPE ? "F" : r.id,
  );
}

const entryArb = fc.option(fc.constantFrom(...PLAYERS), { nil: undefined });
// A rider list as riderOrder makes it: no trailing filler.
const layoutArb = fc
  .uniqueArray(fc.constantFrom(...PLAYERS), { maxLength: SEATS })
  .chain((players) =>
    fc
      .array(fc.boolean(), { minLength: SEATS, maxLength: SEATS })
      .map((gaps) => {
        const layout: (PlayerId | undefined)[] = [];
        for (const id of players) {
          while (gaps.shift() && layout.length < SEATS - 1)
            layout.push(undefined);
          if (layout.length < SEATS) layout.push(asPlayerId(id));
        }
        return layout;
      }),
  );

describe("SeatFillers (ADR 0120)", () => {
  it("lays the list up to the first player who got off, keeps the rest waiting in their slots, and lays it all on the next tick", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(entryArb, {
          maxLength: SEATS,
          selector: (e) => e ?? Symbol(),
        }),
        layoutArb,
        (before, layout) => {
          const f = fixture();
          seat(f, before);
          const fillers = new SeatFillers();
          layOn(f, fillers, layout);
          const laid = listOf(f.vehicle);
          const waiting = fillers.waitingRiders(asVehicleId("boat"));
          expect(laid).toEqual(
            layout.slice(0, laid.length).map((id) => id ?? "F"),
          );
          // Everyone the list could not hold yet waits for their own slot.
          expect([...waiting]).toEqual(
            layout
              .map((id, slot) => [id, slot] as const)
              .filter(([id, slot]) => id !== undefined && slot >= laid.length),
          );
          f.endTick();
          layOn(f, fillers, layout);
          expect(listOf(f.vehicle)).toEqual(layout.map((id) => id ?? "F"));
          expect(fillers.waitingRiders(asVehicleId("boat")).size).toBe(0);
          // No filler is left outside the vehicle.
          for (const filler of fillersIn(f))
            expect(filler.mount).toBe(f.vehicle);
        },
      ),
    );
  });

  it("never holds more fillers than free seats below the last player, whatever the layouts tick after tick", () => {
    fc.assert(
      fc.property(
        fc.array(layoutArb, { minLength: 1, maxLength: 8 }),
        (layouts) => {
          const f = fixture();
          const fillers = new SeatFillers();
          for (const layout of layouts) {
            layOn(f, fillers, layout);
            const riding = f.vehicle.riders.filter(
              (r) => r.typeId === SEAT_FILLER_TYPE,
            ).length;
            expect(fillersIn(f)).toHaveLength(riding);
            expect(riding).toBeLessThanOrEqual(
              layout.filter((id) => id === undefined).length,
            );
            f.endTick();
          }
          const last = layouts.at(-1) ?? [];
          layOn(f, fillers, last);
          expect(listOf(f.vehicle)).toEqual(last.map((id) => id ?? "F"));
        },
      ),
    );
  });

  it("keeps the rear rider in the rear and adds one filler when the driver gets out (in-game test boat_seat_fillers)", () => {
    const f = fixture();
    const fillers = new SeatFillers();
    layOn(f, fillers, [asPlayerId("p0"), undefined, asPlayerId("p1")]);
    expect(listOf(f.vehicle)).toEqual(["p0", "F", "p1"]);
    f.endTick();
    const driver = f.players.get("p0") as Fake;
    f.vehicle.riders.splice(0, 1);
    driver.mount = undefined;
    f.endTick();
    layOn(f, fillers, [undefined, undefined, asPlayerId("p1")]);
    // The engine does not take p1 back in the tick they got off, so they wait in
    // slot 2 instead of a filler taking their seat.
    expect(listOf(f.vehicle)).toEqual(["F", "F"]);
    expect([...fillers.waitingRiders(asVehicleId("boat"))]).toEqual([
      ["p1", 2],
    ]);
    expect(fillersIn(f)).toHaveLength(2);
    f.endTick();
    layOn(f, fillers, [undefined, undefined, asPlayerId("p1")]);
    expect(listOf(f.vehicle)).toEqual(["F", "F", "p1"]);
    expect(fillersIn(f)).toHaveLength(2);
    expect(fillers.waitingRiders(asVehicleId("boat")).size).toBe(0);
  });

  it("gives a waiting player's seat to a filler once they have waited too long or cannot get in", () => {
    fc.assert(
      fc.property(fc.constantFrom("refused", "far"), (failure) => {
        const f = fixture();
        const fillers = new SeatFillers();
        seat(f, [undefined, "p1"]);
        layOn(f, fillers, [undefined, undefined, asPlayerId("p1")]);
        expect(
          fillers.waitingRiders(asVehicleId("boat")).has(asPlayerId("p1")),
        ).toBe(true);
        if (failure === "far")
          (f.players.get("p1") as Fake).location = { x: 50, y: 64, z: 0 };
        for (let tick = 0; tick < 10; tick++) {
          // A vehicle that keeps refusing p1, as if they had just got off it.
          if (failure === "far") f.endTick();
          layOn(f, fillers, [undefined, undefined, asPlayerId("p1")]);
        }
        expect(fillers.waitingRiders(asVehicleId("boat")).size).toBe(0);
        expect(listOf(f.vehicle)).toEqual(["F", "F", "F"]);
      }),
    );
  });

  it("does nothing when the list is already in place", () => {
    const f = fixture();
    const filler = f.make("filler", SEAT_FILLER_TYPE);
    const player = f.players.get("p0") as Fake;
    for (const rider of [filler, player]) {
      f.vehicle.riders.push(rider);
      rider.mount = f.vehicle;
    }
    new SeatFillers().lay(
      asVehicleId("boat"),
      asEntity(f.vehicle),
      [undefined, asPlayerId("p0")],
      (id) => f.players.get(id) as unknown as Player,
    );
    expect(f.vehicle.riders).toEqual([filler, player]);
    expect(f.dimension.spawnEntity).not.toHaveBeenCalled();
  });

  it("holds the seat of a player who cannot get in with a filler, so the riders after them keep their seats", () => {
    const f = fixture();
    const far = f.players.get("p1") as Fake;
    far.location = { x: 50, y: 64, z: 0 };
    new SeatFillers().lay(
      asVehicleId("boat"),
      asEntity(f.vehicle),
      [asPlayerId("p0"), asPlayerId("p1"), asPlayerId("p2")],
      (id) => f.players.get(id) as unknown as Player,
    );
    expect(listOf(f.vehicle)).toEqual(["p0", "F", "p2"]);
  });

  it("puts every player of the list back aboard, in order, when fillers cannot spawn or get in", () => {
    fc.assert(
      fc.property(
        layoutArb,
        fc.constantFrom("throws", "refused"),
        (layout, failure) => {
          const f = fixture();
          // Seat the players in reverse, so every one of them is out of place.
          for (const id of layout.filter((p) => p !== undefined).reverse()) {
            const rider = f.players.get(id) as Fake;
            f.vehicle.riders.push(rider);
            rider.mount = f.vehicle;
          }
          if (failure === "throws")
            f.dimension.spawnEntity.mockImplementation(() => {
              throw new Error("unloaded chunk");
            });
          else
            f.dimension.spawnEntity.mockImplementation((typeId: string) => {
              const filler = f.make(`stuck${f.entities.size}`, typeId);
              filler.mount = f.make(`other${f.entities.size}`, "x");
              return filler;
            });
          const fillers = new SeatFillers();
          layOn(f, fillers, layout);
          // The players who got off in this tick wait for the next one, in order.
          expect([
            ...listOf(f.vehicle),
            ...fillers.waitingRiders(asVehicleId("boat")).keys(),
          ]).toEqual(layout.filter((p) => p));
          f.endTick();
          layOn(f, fillers, layout);
          expect(listOf(f.vehicle)).toEqual(layout.filter((p) => p));
          // A filler that could not get in is not left in the world.
          for (const entity of f.entities.values())
            expect(entity.typeId === SEAT_FILLER_TYPE).toBe(false);
        },
      ),
    );
  });

  it("takes a boarding player off another mount, and puts them back when the vehicle refuses them", () => {
    const f = fixture();
    const deckSeat = f.make("deckSeat", "yasu_ride:deck_seat");
    const player = f.players.get("p0") as Fake;
    deckSeat.riders.push(player);
    player.mount = deckSeat;
    new SeatFillers().lay(
      asVehicleId("boat"),
      asEntity(f.vehicle),
      [undefined, undefined, asPlayerId("p0")],
      (id) => f.players.get(id) as unknown as Player,
    );
    expect(listOf(f.vehicle)).toEqual(["F", "F", "p0"]);
    expect(deckSeat.riders).toEqual([]);

    const full = fixture();
    for (const id of ["p1", "p2", "p3", "p4"]) {
      const rider = full.players.get(id) as Fake;
      full.vehicle.riders.push(rider);
      rider.mount = full.vehicle;
    }
    const seat = full.make("deckSeat", "yasu_ride:deck_seat");
    const refused = full.players.get("p0") as Fake;
    seat.riders.push(refused);
    refused.mount = seat;
    new SeatFillers().lay(
      asVehicleId("boat"),
      asEntity(full.vehicle),
      ["p1", "p2", "p3", "p4", "p0"].map(asPlayerId),
      (id) => full.players.get(id) as unknown as Player,
    );
    expect(refused.mount).toBe(seat);
  });

  it("removes the fillers it laid when the vehicle is released", () => {
    const f = fixture();
    const fillers = new SeatFillers();
    fillers.lay(
      asVehicleId("boat"),
      asEntity(f.vehicle),
      [undefined, undefined, asPlayerId("p0")],
      (id) => f.players.get(id) as unknown as Player,
    );
    const laid = f.vehicle.riders.filter((r) => r.typeId === SEAT_FILLER_TYPE);
    expect(laid).toHaveLength(2);
    fillers.clearGone(new Set([asVehicleId("boat")]));
    expect(laid.every((filler) => filler.isValid)).toBe(true);
    fillers.clearGone(new Set());
    expect(laid.every((filler) => !filler.isValid)).toBe(true);
  });

  it("removes a filler that loads without riding a vehicle, and maps one that rides to its vehicle", () => {
    const f = fixture();
    const riding = f.make("riding", SEAT_FILLER_TYPE);
    f.vehicle.riders.push(riding);
    riding.mount = f.vehicle;
    const loose = f.make("loose", SEAT_FILLER_TYPE);
    removeOrphanSeatFiller(asEntity(riding));
    removeOrphanSeatFiller(asEntity(loose));
    removeOrphanSeatFiller(asEntity(f.players.get("p0") as Fake));
    expect(riding.isValid).toBe(true);
    expect(loose.isValid).toBe(false);
    expect((f.players.get("p0") as Fake).isValid).toBe(true);
    expect(vehicleOfSeatFiller(asEntity(riding))).toBe(f.vehicle);
    expect(
      vehicleOfSeatFiller(asEntity(f.players.get("p0") as Fake)),
    ).toBeUndefined();
  });
});
