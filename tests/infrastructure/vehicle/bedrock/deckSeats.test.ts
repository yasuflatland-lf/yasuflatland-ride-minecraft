import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { asVehicleId } from "../../../../src/domain/shared/ids";
import type { Vec3 } from "../../../../src/domain/shared/vec";
import type { DeckSeatSpot } from "../../../../src/domain/vehicle/dock/dock";
import { DECK_SEAT_REACH } from "../../../../src/domain/vehicle/kinds/index";
import {
  DeckSeats,
  removeOrphanDeckSeat,
} from "../../../../src/infrastructure/vehicle/bedrock/deckSeats";
import {
  DECK_SEAT_COMPACT_EVENT,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

function fixture() {
  const entities = new Map<string, ReturnType<typeof entity>>();
  const boarded: string[] = [];
  // Cells that hold a block, by "x,y,z"; every other cell is air.
  const blocks = new Map<string, string>();
  const dimension = {
    id: "overworld",
    getBlock: vi.fn((at: Vec3) => {
      const typeId = blocks.get(
        `${Math.floor(at.x)},${Math.floor(at.y)},${Math.floor(at.z)}`,
      );
      return { typeId: typeId ?? "minecraft:air", isAir: typeId === undefined };
    }),
    spawnEntity: vi.fn((type: string, at: Vec3) =>
      entity(`seat${entities.size}`, type, at),
    ),
    getEntities: vi.fn(() => [...entities.values()].filter((e) => e.isValid)),
  };
  function entity(id: string, typeId: string, at = { x: 0, y: 0, z: 0 }) {
    const saved = new Map<string, unknown>();
    const riders: { id: string; typeId: string }[] = [];
    const rideable = {
      getRiders: () => riders,
      ejectRider: vi.fn((player: (typeof riders)[number]) => {
        riders.splice(riders.indexOf(player), 1);
      }),
      addRider: vi.fn((player: (typeof riders)[number]) => {
        boarded.push(player.id);
        riders.push(player);
        return true;
      }),
    };
    const e = {
      id,
      typeId,
      location: at,
      dimension: dimension as unknown as Entity["dimension"],
      isValid: true,
      saved,
      riders,
      rideable,
      getDynamicProperty: (key: string) => saved.get(key),
      setDynamicProperty: (key: string, value: unknown) =>
        saved.set(key, value),
      getComponent: () => rideable,
      setRotation: vi.fn(),
      triggerEvent: vi.fn(),
      teleport: vi.fn((at: Vec3) => {
        e.location = at;
      }),
      remove: vi.fn(() => {
        e.isValid = false;
      }),
    };
    entities.set(id, e);
    return e;
  }
  const boat = entity("boat", "yasu_ride:sportsboat");
  game.getEntity.mockImplementation((id: string) => entities.get(id));
  return {
    boat,
    car: boat as unknown as Entity,
    entities,
    dimension,
    boarded,
    blocks,
  };
}

function seatedPlayer(
  id: string,
  dimension: { id: string } = { id: "overworld" },
) {
  const p = {
    id,
    typeId: "minecraft:player",
    isValid: true,
    dimension,
    // Where the engine dropped them: next to the seats, which stand within x 0 to 4.
    location: { x: 1, y: 0, z: 1 },
    health: undefined as { currentValue: number } | undefined,
    riding: undefined as object | undefined,
    getComponent: (name: string) =>
      name === "minecraft:riding"
        ? p.riding
        : name === "minecraft:health"
          ? p.health
          : undefined,
    getRotation: () => ({ x: 12, y: 34 }),
    teleport: vi.fn(),
  };
  return p;
}

const STAND = { x: 4.5, y: 1, z: 2.5 } as const;

/** Keeps one deck seat with a stand spot and seats a player on it. */
function seatedOnce(spot: DeckSeatSpot = { x: 0, y: 0, z: 0, stand: STAND }) {
  const f = fixture();
  const seats = new DeckSeats();
  const vehicleId = asVehicleId(f.car.id);
  seats.keep(vehicleId, f.car, [spot], 0);
  const [id] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  const seat = f.entities.get(id);
  if (!seat) throw new Error("missing seat");
  const player = seatedPlayer("player");
  seat.riders.push(player);
  player.riding = seat;
  seats.keep(vehicleId, f.car, [spot], 0);
  const standUp = () => {
    seat.riders.splice(0);
    player.riding = undefined;
  };
  return { f, seats, seat, player, vehicleId, spot, standUp };
}

const point = fc.record({
  x: fc.integer({ min: -10, max: 10 }),
  y: fc.integer({ min: -10, max: 10 }),
  z: fc.integer({ min: -10, max: 10 }),
});

it("restores seat ownership, replaces missing seats, moves drifted seats and clears on removal", () => {
  fc.assert(
    fc.property(
      fc.array(point, { minLength: 4, maxLength: 4 }),
      fc.integer({ min: -180, max: 180 }),
      (positions, yaw) => {
        const f = fixture();
        new DeckSeats().keep(asVehicleId(f.car.id), f.car, positions, yaw);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        expect(ids).toHaveLength(4);
        ids.forEach((id, index) => {
          const seat = f.entities.get(id);
          expect(seat?.location).toEqual(positions[index]);
          expect(seat?.saved.get(DECK_SEAT_OF_PROPERTY)).toBe(f.car.id);
          expect(seat?.setRotation).toHaveBeenCalledWith({ x: 0, y: yaw });
        });
        const reloaded = new DeckSeats();
        reloaded.keep(asVehicleId(f.car.id), f.car, positions, yaw);
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(4);
        for (const id of ids)
          expect(f.entities.get(id)?.teleport).not.toHaveBeenCalled();
        f.entities.get(ids[0] ?? "")?.remove();
        const shifted = positions.map((p) => ({ ...p, x: p.x + 1 }));
        reloaded.keep(asVehicleId(f.car.id), f.car, shifted, yaw);
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(5);
        reloaded.clearGone(new Set([asVehicleId(f.car.id)]));
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toHaveLength(4);
        reloaded.keep(asVehicleId(f.car.id), f.car, [], yaw);
        expect(f.boat.saved.get(DECK_SEATS_PROPERTY)).toBeUndefined();
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toEqual([]);
        reloaded.keep(asVehicleId(f.car.id), f.car, positions, yaw);
        reloaded.clearGone(new Set());
        expect(
          f.dimension.getEntities().filter((e) => e.typeId === DECK_SEAT_TYPE),
        ).toEqual([]);
      },
    ),
  );
});

it("boards occupied deck seats in index order across gaps", () => {
  fc.assert(
    fc.property(fc.subarray([0, 1, 2, 3]), (occupied) => {
      const f = fixture();
      const seats = new DeckSeats();
      seats.keep(
        asVehicleId(f.car.id),
        f.car,
        Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })),
        0,
      );
      const ids: string[] = JSON.parse(
        String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
      );
      ids.forEach((id, index) => {
        if (occupied.includes(index))
          f.entities
            .get(id)
            ?.riders.push({ id: `player${index}`, typeId: "minecraft:player" });
      });
      expect(seats.riders(f.car).map((p) => p?.id)).toEqual(
        [0, 1, 2, 3].map((i) =>
          occupied.includes(i) ? `player${i}` : undefined,
        ),
      );
      seats.board(f.car);
      expect(f.boarded).toEqual(occupied.map((i) => `player${i}`));
      expect(seats.riders(f.car)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    }),
  );
});

it("removes a loaded orphan and preserves a seat with a nearby loaded owner", () => {
  const f = fixture();
  new DeckSeats().keep(asVehicleId(f.car.id), f.car, [{ x: 0, y: 0, z: 0 }], 0);
  const seat = f.dimension
    .getEntities()
    .find((e) => e.typeId === DECK_SEAT_TYPE);
  if (!seat) throw new Error("missing seat");
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(seat.remove).not.toHaveBeenCalled();
  expect(f.dimension.getEntities).toHaveBeenCalledWith({
    location: seat.location,
    maxDistance: DECK_SEAT_REACH + 5,
  });
  f.boat.remove();
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(seat.remove).toHaveBeenCalledOnce();
});

it("removes only the deck seats whose boat seat is taken and keeps the others in place", () => {
  fc.assert(
    fc.property(
      fc.array(point, { minLength: 4, maxLength: 4 }),
      fc.subarray([0, 1, 2, 3]),
      (positions, taken) => {
        const f = fixture();
        const seats = new DeckSeats();
        seats.keep(asVehicleId(f.car.id), f.car, positions, 0);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        seats.keep(
          asVehicleId(f.car.id),
          f.car,
          positions.map((at, seat) => (taken.includes(seat) ? undefined : at)),
          0,
        );
        expect(
          JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY))),
        ).toEqual(ids.map((id, seat) => (taken.includes(seat) ? null : id)));
        ids.forEach((id, seat) => {
          expect(f.entities.get(id)?.isValid).toBe(!taken.includes(seat));
        });
        expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(4);
      },
    ),
  );
});

it("treats a corrupt saved seat list as no seats and drops entries that are not ids", () => {
  for (const [raw, expected] of [
    ["{", []],
    ['{"seat":"a"}', []],
    [JSON.stringify(["missing", 3, null]), [undefined, undefined, undefined]],
  ] as const) {
    const f = fixture();
    f.boat.saved.set(DECK_SEATS_PROPERTY, raw);
    expect(new DeckSeats().riders(f.car)).toEqual(expected);
  }
});

it("leaves a non-seat or removed entity alone when checking for orphans", () => {
  const f = fixture();
  removeOrphanDeckSeat(f.car);
  const seat = f.dimension.spawnEntity(DECK_SEAT_TYPE, { x: 0, y: 0, z: 0 });
  seat.isValid = false;
  removeOrphanDeckSeat(seat as unknown as Entity);
  expect(f.boat.remove).not.toHaveBeenCalled();
  expect(seat.remove).not.toHaveBeenCalled();
  expect(f.dimension.getEntities).not.toHaveBeenCalled();
});

it("ignores a vehicle it never kept seats for once the vehicle is gone", () => {
  const f = fixture();
  new DeckSeats().keep(
    asVehicleId("unknown"),
    undefined,
    [{ x: 0, y: 0, z: 0 }],
    0,
  );
  expect(f.dimension.spawnEntity).not.toHaveBeenCalled();
});

it("replaces a seat left in another dimension by one beside the boat", () => {
  const f = fixture();
  const seats = new DeckSeats();
  const at = [{ x: 1, y: 2, z: 3 }];
  seats.keep(asVehicleId(f.car.id), f.car, at, 0);
  const [first] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  const old = f.entities.get(first);
  if (!old) throw new Error("missing seat");
  old.dimension = { id: "nether" } as unknown as Entity["dimension"];
  seats.keep(asVehicleId(f.car.id), f.car, at, 0);
  expect(old.remove).toHaveBeenCalledOnce();
  const [second] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  expect(second).not.toBe(first);
  expect(f.entities.get(second)?.location).toEqual(at[0]);
});

it("boards nobody without a rideable boat, and keeps a refused rider on the deck seat", () => {
  const f = fixture();
  const seats = new DeckSeats();
  seats.keep(asVehicleId(f.car.id), f.car, [{ x: 0, y: 0, z: 0 }], 0);
  const [id] = JSON.parse(String(f.boat.saved.get(DECK_SEATS_PROPERTY)));
  const seat = f.entities.get(id);
  if (!seat) throw new Error("missing seat");
  const player = { id: "player", typeId: "minecraft:player" };
  seat.riders.push(player);
  seats.board({ ...f.car, getComponent: () => undefined } as unknown as Entity);
  expect(seat.rideable.ejectRider).not.toHaveBeenCalled();
  f.boat.rideable.addRider.mockReturnValueOnce(false);
  seats.board(f.car);
  expect(seat.rideable.ejectRider).toHaveBeenCalledWith(player);
  expect(seats.riders(f.car).map((p) => p?.id)).toEqual(["player"]);
});

it("triggers the compact event once on each newly spawned compact seat only (ADR 0095)", () => {
  fc.assert(
    fc.property(
      fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }),
      (flags) => {
        const f = fixture();
        const seats = new DeckSeats();
        const spots = flags.map((compact, x) => ({ x, y: 0, z: 0, compact }));
        seats.keep(asVehicleId(f.car.id), f.car, spots, 0);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        const check = () =>
          ids.forEach((id, i) => {
            const seat = f.entities.get(id);
            if (!seat) throw new Error("missing seat");
            if (flags[i])
              expect(seat.triggerEvent).toHaveBeenCalledExactlyOnceWith(
                DECK_SEAT_COMPACT_EVENT,
              );
            else expect(seat.triggerEvent).not.toHaveBeenCalled();
          });
        check();
        seats.keep(asVehicleId(f.car.id), f.car, spots, 0);
        check();
      },
    ),
  );
});

it("ejects every deck seat rider in seat order and returns them (ADR 0095)", () => {
  fc.assert(
    fc.property(fc.subarray([0, 1, 2, 3, 4]), (occupied) => {
      const f = fixture();
      const seats = new DeckSeats();
      seats.keep(
        asVehicleId(f.car.id),
        f.car,
        Array.from({ length: 5 }, () => ({ x: 0, y: 0, z: 0 })),
        0,
      );
      const ids: string[] = JSON.parse(
        String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
      );
      ids.forEach((id, i) => {
        if (occupied.includes(i))
          f.entities
            .get(id)
            ?.riders.push({ id: `player${i}`, typeId: "minecraft:player" });
      });
      expect(seats.eject(f.car).map((p) => p.id)).toEqual(
        occupied.map((i) => `player${i}`),
      );
      expect(seats.riders(f.car)).toEqual(Array(5).fill(undefined));
      expect(f.boarded).toEqual([]);
    }),
  );
});

it("stands up exactly the players who left a kept deck seat for nothing, at their seat's spot, keeping their view (ADR 0109)", () => {
  fc.assert(
    fc.property(
      fc.subarray([0, 1, 2, 3, 4]),
      fc.subarray([0, 1, 2, 3, 4]),
      (occupied, leaving) => {
        const f = fixture();
        const seats = new DeckSeats();
        const vehicleId = asVehicleId(f.car.id);
        const spots = Array.from({ length: 5 }, (_, i) => ({
          x: i,
          y: 0,
          z: 0,
          stand: { x: i + 0.5, y: 1, z: 2.5 },
        }));
        seats.keep(vehicleId, f.car, spots, 0);
        const ids: string[] = JSON.parse(
          String(f.boat.saved.get(DECK_SEATS_PROPERTY)),
        );
        const players = ids.map((id, i) => {
          const player = seatedPlayer(`player${i}`);
          const seat = f.entities.get(id);
          if (seat && occupied.includes(i)) {
            seat.riders.push(player);
            player.riding = seat;
          }
          return player;
        });
        seats.keep(vehicleId, f.car, spots, 0);
        for (const i of leaving) {
          const riders = f.entities.get(ids[i] ?? "")?.riders ?? [];
          const at = riders.findIndex((r) => r.id === `player${i}`);
          if (at >= 0) riders.splice(at, 1);
          const player = players[i];
          if (player) player.riding = undefined;
        }
        seats.keep(vehicleId, f.car, spots, 0);
        players.forEach((player, i) => {
          if (occupied.includes(i) && leaving.includes(i))
            expect(player.teleport).toHaveBeenCalledExactlyOnceWith(
              spots[i]?.stand,
              { rotation: { x: 12, y: 34 } },
            );
          else expect(player.teleport).not.toHaveBeenCalled();
        });
        // Standing up happens once: the next keep no longer counts them as seated.
        seats.keep(vehicleId, f.car, spots, 0);
        for (const player of players)
          expect(player.teleport.mock.calls.length).toBeLessThanOrEqual(1);
      },
    ),
  );
});

it("leaves a player who still rides something where they are, so boarding moves nobody (ADR 0109)", () => {
  const { f, seats, seat, player, vehicleId, spot } = seatedOnce();
  seats.board(f.car);
  player.riding = {};
  expect(seat.riders).toEqual([]);
  seats.keep(vehicleId, f.car, [spot], 0);
  expect(player.teleport).not.toHaveBeenCalled();
});

it("leaves the riders of removed deck seats to the engine: departure, a taken vehicle seat, a gone vehicle (ADR 0109)", () => {
  for (const next of [[], [undefined]] as const) {
    const { f, seats, seat, player, vehicleId, standUp } = seatedOnce();
    standUp();
    seats.keep(vehicleId, f.car, next, 0);
    expect(seat.remove).toHaveBeenCalled();
    expect(player.teleport).not.toHaveBeenCalled();
  }
  const { seats, player, vehicleId, standUp } = seatedOnce();
  standUp();
  seats.clearGone(new Set());
  seats.keep(vehicleId, undefined, [], 0);
  expect(player.teleport).not.toHaveBeenCalled();
});

it("moves nobody after a reload, for a seat without a stand spot, or onto a replaced seat (ADR 0109)", () => {
  {
    const { f, player, vehicleId, spot, standUp } = seatedOnce();
    standUp();
    new DeckSeats().keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce({
      x: 0,
      y: 0,
      z: 0,
    });
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, seat, player, vehicleId, spot, standUp } = seatedOnce();
    standUp();
    seat.remove();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(f.dimension.spawnEntity).toHaveBeenCalledTimes(2);
    expect(player.teleport).not.toHaveBeenCalled();
  }
});

it("leaves a player who is dead or went beyond the engine's dismount spot where they are (ADR 0109)", () => {
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    player.health = { currentValue: 0 };
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    player.health = { currentValue: 20 };
    player.location = { x: 0, y: 3, z: -5 };
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).toHaveBeenCalledOnce();
  }
  for (const location of [
    { x: 7, y: 0, z: 0 },
    { x: 0, y: 7, z: 0 },
    { x: 100, y: 64, z: -300 },
  ]) {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    player.location = location;
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
});

it("leaves the engine's spot when the stand cells are blocked or the player is gone (ADR 0109)", () => {
  for (const cell of ["4,1,2", "4,2,2"]) {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    f.blocks.set(cell, "minecraft:stone");
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    f.blocks.set("4,2,2", "minecraft:light_block_15");
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).toHaveBeenCalledOnce();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    f.dimension.getBlock.mockImplementation(() => {
      throw new Error("unloaded");
    });
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    player.isValid = false;
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
  {
    const { f, seats, player, vehicleId, spot, standUp } = seatedOnce();
    player.dimension = { id: "nether" };
    standUp();
    seats.keep(vehicleId, f.car, [spot], 0);
    expect(player.teleport).not.toHaveBeenCalled();
  }
});
