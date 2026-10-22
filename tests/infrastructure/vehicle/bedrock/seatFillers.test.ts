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

/** A vehicle whose rider list behaves as Bedrock's: riders are added at the end and seated by index (ADR 0019). */
function fixture() {
  const entities = new Map<string, Fake>();
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
            getRiders: () => [...fake.riders],
            addRider: (rider: Fake) => {
              if (rider.mount || fake.riders.length >= SEATS) return false;
              fake.riders.push(rider);
              rider.mount = fake;
              return true;
            },
            ejectRider: (rider: Fake) => {
              const at = fake.riders.indexOf(rider);
              if (at < 0) return;
              fake.riders.splice(at, 1);
              rider.mount = undefined;
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
  return { vehicle, players, make, entities, dimension };
}

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
  it("leaves the vehicle with exactly the laid rider list, whatever it held before", () => {
    fc.assert(
      fc.property(
        fc.array(entryArb, { maxLength: SEATS }),
        layoutArb,
        (before, layout) => {
          const f = fixture();
          const seen = new Set<string>();
          for (const entry of before) {
            if (entry && seen.has(entry)) continue;
            if (entry) seen.add(entry);
            const rider = entry
              ? (f.players.get(entry) as Fake)
              : f.make(
                  `old${seen.size}${f.vehicle.riders.length}`,
                  SEAT_FILLER_TYPE,
                );
            f.vehicle.riders.push(rider);
            rider.mount = f.vehicle;
          }
          const fillers = new SeatFillers();
          fillers.lay(
            asVehicleId("boat"),
            asEntity(f.vehicle),
            layout,
            (id) => f.players.get(id) as unknown as Player,
          );
          expect(listOf(f.vehicle)).toEqual(layout.map((id) => id ?? "F"));
          // No filler is left outside the vehicle.
          for (const entity of f.entities.values())
            if (entity.typeId === SEAT_FILLER_TYPE)
              expect(entity.mount).toBe(f.vehicle);
        },
      ),
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
