import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  asPlayerId,
  asVehicleId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import { forward, leftOf, type Vec2 } from "../../../src/domain/shared/vec";
import type { Drive, DriveStep } from "../../../src/domain/vehicle/drive";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  profileOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_PROFILE } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  aimReach,
  ChosenSeats,
  chooseSeat,
  riderOrder,
  type SeatAssignment,
  settleSeats,
} from "../../../src/domain/vehicle/seatChoice";
import {
  type RiderView,
  Vehicle,
  type VehicleTickInput,
} from "../../../src/domain/vehicle/vehicle";
import { riderView } from "../../support/riders";

const SEATS = SPORTSBOAT_PROFILE.seats.positions;
const AIM_HEIGHT = SPORTSBOAT_SPEC.seatAimHeight;
const AIM_RADIUS = SPORTSBOAT_SPEC.seatAimRadius;
const TARGETS = { positions: SEATS, height: AIM_HEIGHT, radius: AIM_RADIUS };
const IDS = ["a", "b", "c", "d", "e", "f"].map(asPlayerId);
const NONE = { seats: [], boarding: new Set<PlayerId>() };

const coord = fc.double({ min: -8, max: 8, noNaN: true });
const yawArb = fc.double({ min: -180, max: 180, noNaN: true });
const seatArb = fc.integer({ min: 0, max: SEATS.length - 1 });
const assignmentArb = fc
  .array(fc.option(fc.constantFrom(...IDS), { nil: undefined }), {
    minLength: SEATS.length,
    maxLength: SEATS.length,
  })
  .map((seats) =>
    seats.map((id, seat) =>
      id !== undefined && seats.indexOf(id) === seat ? id : undefined,
    ),
  );

/** The world offset from the vehicle's feet of seat `seat`, at the riders' height, for a vehicle facing `yaw`. */
function seatAt(yaw: number, seat: number) {
  const f = forward(yaw);
  const l = leftOf(f);
  const s = SEATS[seat] as Vec2;
  return {
    x: l.x * s.x + f.x * s.z,
    y: AIM_HEIGHT,
    z: l.z * s.x + f.z * s.z,
  };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

describe("aimReach (ADR 0120)", () => {
  it("hits a seat a line of sight points straight at, entering its ball one radius short of it", () => {
    fc.assert(
      fc.property(
        coord,
        fc.double({ min: 0, max: 4, noNaN: true }),
        coord,
        seatArb,
        (x, y, z, seat) => {
          const at = SEATS[seat] as Vec2;
          const eye = { x, y, z };
          const d = { x: at.x - x, y: AIM_HEIGHT - y, z: at.z - z };
          fc.pre(Math.hypot(d.x, d.y, d.z) > 1e-3);
          const reach = aimReach({ eye, view: d }, at, TARGETS);
          expect(reach.hit).toBe(true);
          expect(reach.miss).toBeLessThan(1e-6);
          expect(reach.along).toBeCloseTo(
            Math.max(0, Math.hypot(d.x, d.y, d.z) - AIM_RADIUS),
            6,
          );
        },
      ),
    );
  });

  it("measures a seat behind the eye from the eye itself", () => {
    const eye = { x: 0, y: AIM_HEIGHT, z: 3 };
    const reach = aimReach(
      { eye, view: { x: 0, y: 0, z: 1 } },
      SEATS[2] as Vec2,
      TARGETS,
    );
    expect(reach.hit).toBe(false);
    expect(reach.miss).toBeCloseTo(Math.hypot(0.38, 3.8), 9);
  });
});

describe("chooseSeat (ADR 0120)", () => {
  const free = (seats: SeatAssignment, held: SeatAssignment, who: PlayerId) =>
    SEATS.map((_, i) => i).filter(
      (i) =>
        seats[i] === undefined && (held[i] === undefined || held[i] === who),
    );

  it("takes the first free seat the line of sight enters, else the one it passes nearest, never a seat held for another player", () => {
    const who = IDS[5] as PlayerId;
    fc.assert(
      fc.property(
        fc.record({
          x: coord,
          y: fc.double({ min: 0, max: 4, noNaN: true }),
          z: coord,
        }),
        fc.record({ x: coord, y: coord, z: coord }),
        assignmentArb,
        assignmentArb,
        (eye, view, seats, held) => {
          const aim = { eye, view };
          const seat = chooseSeat(aim, TARGETS, seats, held, who);
          const open = free(seats, held, who);
          if (open.length === 0) {
            expect(seat).toBeUndefined();
            return;
          }
          expect(open).toContain(seat);
          const reach = (i: number) => aimReach(aim, SEATS[i] as Vec2, TARGETS);
          const chosen = reach(seat as number);
          for (const other of open) {
            const r = reach(other);
            if (r.hit) {
              expect(chosen.hit).toBe(true);
              expect(chosen.along).toBeLessThanOrEqual(r.along);
            } else if (!chosen.hit) {
              expect(chosen.miss).toBeLessThanOrEqual(r.miss);
            }
          }
        },
      ),
    );
  });

  it("without a line of sight, takes the free seat nearest where the player stands", () => {
    fc.assert(
      fc.property(coord, coord, assignmentArb, (x, z, seats) => {
        const seat = chooseSeat({ eye: { x, y: 1.6, z } }, TARGETS, seats);
        const open = free(seats, [], IDS[0] as PlayerId);
        if (open.length === 0) {
          expect(seat).toBeUndefined();
          return;
        }
        for (const other of open)
          expect(
            dist({ x, z }, SEATS[seat as number] as Vec2),
          ).toBeLessThanOrEqual(dist({ x, z }, SEATS[other] as Vec2));
      }),
    );
  });

  it("gives the rear seat to a player behind the boat who looks level at it, looks up at it from the water, or aims above it", () => {
    const rearLeft = SEATS[3] as Vec2;
    const at = (y: number) => ({ x: rearLeft.x, y, z: rearLeft.z });
    for (const [eye, target] of [
      [
        { x: 0.38, y: 0.7, z: -3 },
        { x: 0.38, y: 0.7, z: 0 },
      ],
      [
        { x: 0.38, y: AIM_HEIGHT, z: -3 },
        { x: 0.38, y: AIM_HEIGHT, z: 0 },
      ],
      [{ x: 0.38, y: 0.1, z: -3 }, at(AIM_HEIGHT)],
      [{ x: 0.38, y: 0.7, z: -3 }, at(1.0)],
      [{ x: 2, y: 0.3, z: -0.8 }, at(0.9)],
    ] as const) {
      const view = {
        x: target.x - eye.x,
        y: target.y - eye.y,
        z: target.z - eye.z,
      };
      expect(chooseSeat({ eye, view }, TARGETS, [IDS[0]])).toBe(3);
    }
    // A touch player standing at the stern.
    expect(
      chooseSeat({ eye: { x: 0.5, y: 1, z: -2.5 } }, TARGETS, [IDS[0]]),
    ).toBe(3);
  });
});

describe("settleSeats (ADR 0120)", () => {
  it("settles handover and engine slots exactly, and boards requests only in available seats", () => {
    fc.assert(
      fc.property(
        assignmentArb,
        fc.uniqueArray(
          fc.record({
            id: fc.constantFrom(...IDS),
            slot: fc.option(fc.integer({ min: 0, max: SEATS.length }), {
              nil: undefined,
            }),
          }),
          { selector: ({ id }) => id, maxLength: SEATS.length },
        ),
        fc.subarray(IDS),
        fc.array(fc.tuple(fc.constantFrom(...IDS), coord, coord), {
          maxLength: 4,
        }),
        assignmentArb,
        (previous, aboard, pending, asks, held) => {
          const aboardIds = aboard.map(({ id }) => id);
          const priorBoarding = new Set(
            pending.filter((id) => previous.includes(id)),
          );
          const requests = new Map(
            asks.map(([id, x, z]) => [id, { eye: { x, y: 1.6, z } }]),
          );
          const { seats, boarding } = settleSeats(
            { seats: previous, boarding: priorBoarding },
            aboard,
            requests,
            TARGETS,
            held,
          );
          const taken = seats.filter((id) => id !== undefined);
          expect(new Set(taken).size).toBe(taken.length);
          // A rider aboard goes without a seat only when every seat is taken or held
          // for another player, so all of them are seated while unheld seats last.
          for (const id of aboardIds) {
            if (seats.includes(id)) continue;
            for (const [seat, at] of seats.entries())
              expect(
                at !== undefined ||
                  (held[seat] !== undefined && held[seat] !== id),
              ).toBe(true);
          }
          const unheld = SEATS.filter((_, seat) => held[seat] === undefined);
          if (aboardIds.length <= unheld.length)
            expect(aboardIds.every((id) => seats.includes(id))).toBe(true);
          // Nobody but its holder takes a held seat (ADR 0063); a rider already in it
          // stays.
          for (const [seat, holder] of held.entries()) {
            const id = seats[seat];
            if (holder === undefined || id === undefined || id === holder)
              continue;
            expect(previous[seat]).toBe(id);
          }
          const expected = previous.map((id) =>
            id !== undefined && aboardIds.includes(id) ? id : undefined,
          );
          const [driver] = previous;
          const front = expected[1];
          if (
            driver !== undefined &&
            !aboardIds.includes(driver) &&
            !priorBoarding.has(driver) &&
            front !== undefined &&
            (held[0] === undefined || held[0] === front)
          ) {
            expected[0] = front;
            expected[1] = undefined;
          }
          // Consider engine slots in priority order, with missing slots last.
          for (const slot of [...SEATS.keys(), SEATS.length, undefined]) {
            for (const rider of aboard) {
              if (rider.slot !== slot || expected.includes(rider.id)) continue;
              const available = expected.flatMap((id, seat) =>
                id === undefined &&
                (held[seat] === undefined || held[seat] === rider.id)
                  ? [seat]
                  : [],
              );
              const seat =
                slot !== undefined && available.includes(slot)
                  ? slot
                  : available[0];
              if (seat !== undefined) expected[seat] = rider.id;
            }
          }
          expect(
            seats.map((id) =>
              id !== undefined && boarding.has(id) ? undefined : id,
            ),
          ).toEqual(expected);
          // A request never moves anyone aboard, and only players not aboard board.
          for (const id of boarding) {
            expect(aboardIds.includes(id)).toBe(false);
            expect(requests.has(id)).toBe(true);
            // Never in a seat held for another player (ADR 0063).
            const seat = seats.indexOf(id);
            expect(held[seat] === undefined || held[seat] === id).toBe(true);
          }
          for (const id of taken)
            expect(aboardIds.includes(id) || boarding.has(id)).toBe(true);
        },
      ),
    );
  });

  it("moves the front passenger into the driver's seat when the driver leaves, and keeps the rear riders where they are (ADR 0019)", () => {
    const [driver, front, rear] = IDS as [PlayerId, PlayerId, PlayerId];
    const after = settleSeats(
      { seats: [driver, front, undefined, rear], boarding: new Set() },
      [
        { id: front, slot: 0 },
        { id: rear, slot: 2 },
      ],
      new Map(),
      TARGETS,
    );
    expect(after.seats).toEqual([front, undefined, undefined, rear]);
    const rearOnly = settleSeats(
      { seats: [driver, undefined, rear], boarding: new Set() },
      [{ id: rear, slot: 1 }],
      new Map(),
      TARGETS,
    );
    expect(rearOnly.seats).toEqual([undefined, undefined, rear, undefined]);
  });

  it("does not take a player who was about to get in and did not for a driver who left", () => {
    const [missed, front] = IDS as [PlayerId, PlayerId];
    const after = settleSeats(
      { seats: [missed, front], boarding: new Set([missed]) },
      [{ id: front, slot: 1 }],
      new Map(),
      TARGETS,
    );
    expect(after.seats).toEqual([undefined, front, undefined, undefined]);
  });

  it("leaves a seat held for a deck-seat rider to them when the engine seats someone else (ADR 0063)", () => {
    const [deck, ridden, front, mid, rear] = IDS as [
      PlayerId,
      PlayerId,
      PlayerId,
      PlayerId,
      PlayerId,
    ];
    const held = [deck];
    const after = settleSeats(
      NONE,
      [{ id: ridden, slot: 0 }],
      new Map(),
      TARGETS,
      held,
    );
    expect(after.seats).toEqual([undefined, ridden, undefined, undefined]);
    const boarded = settleSeats(
      after,
      [{ id: ridden, slot: 0 }],
      new Map([[deck, { eye: { x: 0, y: AIM_HEIGHT, z: 0 } }]]),
      TARGETS,
      held,
    );
    expect(boarded.seats[0]).toBe(deck);
    // With every other seat taken, the rider stays without a seat and is left off the
    // rider list.
    const full = settleSeats(
      { seats: [undefined, front, mid, rear], boarding: new Set() },
      [
        { id: front, slot: 0 },
        { id: mid, slot: 1 },
        { id: rear, slot: 2 },
        { id: ridden, slot: 3 },
      ],
      new Map(),
      TARGETS,
      held,
    );
    expect(full.seats).toEqual([undefined, front, mid, rear]);
  });

  it("keeps the front passenger in their seat when the driver leaves and the driver's seat is held for another player", () => {
    const [driver, front, deck] = IDS as [PlayerId, PlayerId, PlayerId];
    const after = settleSeats(
      { seats: [driver, front], boarding: new Set() },
      [{ id: front, slot: 0 }],
      new Map(),
      TARGETS,
      [deck],
    );
    expect(after.seats).toEqual([undefined, front, undefined, undefined]);
  });
});

describe("riderOrder (ADR 0120)", () => {
  it("lists each seat's player up to the last taken seat, with a filler in each free seat below it", () => {
    fc.assert(
      fc.property(assignmentArb, (seats) => {
        const order = riderOrder(seats);
        const last = seats.reduce(
          (found: number, id, seat) => (id === undefined ? found : seat),
          -1,
        );
        expect(order).toHaveLength(last + 1);
        for (const [i, id] of order.entries()) expect(id).toBe(seats[i]);
        if (order.length > 0) expect(order.at(-1)).toBeDefined();
      }),
    );
  });
});

describe("ChosenSeats (ADR 0120)", () => {
  it("keeps every player in the seat they asked for while others get in and out", () => {
    // Each step lets one player ask for a seat or one rider leave; the engine then
    // takes the list as laid, so each rider's slot is their seat.
    const stepArb = fc.oneof(
      fc.record({ ask: fc.constantFrom(...IDS), seat: seatArb }),
      fc.record({ leave: fc.constantFrom(...IDS) }),
    );
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 30 }), (steps) => {
        const chosen = new ChosenSeats(TARGETS);
        let layout: SeatAssignment = [];
        for (const step of steps) {
          let wanted: number | undefined;
          const before = new Map(
            layout.flatMap((id, seat) =>
              id === undefined ? [] : [[id, seat] as const],
            ),
          );
          let aboard = [...before].map(([id, slot]) => ({ id, slot }));
          if ("leave" in step) {
            aboard = aboard.filter((r) => r.id !== step.leave);
          } else if (!before.has(step.ask)) {
            const at = SEATS[step.seat] as Vec2;
            chosen.request(step.ask, { eye: { x: at.x, y: 1.6, z: at.z } });
            if (layout[step.seat] === undefined) wanted = step.seat;
          }
          layout = chosen.settle(aboard);
          const driverLeft = "leave" in step && before.get(step.leave) === 0;
          for (const [id, seat] of before) {
            if (!aboard.some((r) => r.id === id)) continue;
            const now = layout.indexOf(id);
            expect(
              now === seat || (driverLeft && seat === 1 && now === 0),
            ).toBe(true);
          }
          if ("ask" in step && wanted !== undefined)
            expect(layout[wanted]).toBe(step.ask);
          if (layout.length > 0) expect(layout.at(-1)).toBeDefined();
        }
      }),
    );
  });
});

const NO_COMMANDS: DriveStep = {
  impulse: { x: 0, y: 0, z: 0 },
  forward: { x: 0, z: 1 },
  commands: [],
  riders: { thirdPerson: false, underwater: false },
};

function input(
  riders: RiderView[],
  over: Partial<VehicleTickInput> = {},
): VehicleTickInput {
  return {
    tick: 0,
    riders,
    deckSeatInputs: [],
    location: { x: 0, y: 64, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: false,
    solidAt: () => false,
    waterAt: () => true,
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
    targets: () => [],
    ...over,
  };
}

function rider(id: string, seat: number, slot = seat): RiderView {
  const at = seatAt(0, seat);
  return riderView(id, { offset: { x: at.x, z: at.z }, slot });
}

/** The eye and view of a player standing at `stand` and looking at `seat` of a vehicle facing yaw 0. */
function looking(stand: Vec2, seat: number) {
  const eye = { x: stand.x, y: 1.62, z: stand.z };
  const target = seatAt(0, seat);
  return {
    eye,
    view: { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z },
  };
}

describe("Vehicle seat choice (ADR 0120)", () => {
  it("seats a second player who aims at the rear seat behind the driver, with a filler in the front passenger's seat", () => {
    const boat = createVehicle("sportsboat", asVehicleId("boat"), 0);
    const driver = rider("driver", 0);
    expect(boat.tick(input([driver])).seatLayout).toEqual([driver.id]);
    const { eye, view } = looking({ x: 2, z: -2 }, 2);
    expect(boat.requestSeat(asPlayerId("guest"), eye, view)).toBe(true);
    expect(boat.tick(input([driver])).seatLayout).toEqual([
      driver.id,
      undefined,
      asPlayerId("guest"),
    ]);
    // Seated by that layout, the guest stays in the rear.
    expect(boat.tick(input([driver, rider("guest", 2)])).seatLayout).toEqual([
      driver.id,
      undefined,
      asPlayerId("guest"),
    ]);
  });

  it("lets two players both sit in the rear", () => {
    const boat = createVehicle("sportsboat", asVehicleId("boat"), 0);
    const left = looking({ x: 2, z: -2 }, 2);
    const right = looking({ x: -2, z: -2 }, 3);
    boat.requestSeat(asPlayerId("one"), left.eye, left.view);
    boat.requestSeat(asPlayerId("two"), right.eye, right.view);
    expect(boat.tick(input([])).seatLayout).toEqual([
      undefined,
      undefined,
      asPlayerId("one"),
      asPlayerId("two"),
    ]);
  });

  it("leaves boarding to the engine on the kinds that seat in rider order", () => {
    for (const kind of VEHICLE_KINDS) {
      if (profileOf(kind).boarding.order === "chosen") continue;
      const vehicle = createVehicle(kind, asVehicleId(kind), 0);
      const { eye, view } = looking({ x: 2, z: -2 }, 2);
      expect(vehicle.requestSeat(asPlayerId("p"), eye, view)).toBe(false);
      expect(vehicle.tick(input([])).seatLayout).toBeUndefined();
    }
  });

  it("never seats a pressing player in the seat of a deck seat someone sits on, which would take it away under them (ADR 0063)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        seatArb,
        (sitting, aimed) => {
          const drive: Drive = {
            speed: 0,
            yaw: 0,
            resync: () => {},
            onDriverMounted: () => {},
            onSeatVacated: () => [],
            step: () => ({ ...NO_COMMANDS, boardDeckRiders: false }),
          };
          const boat = new Vehicle(
            asVehicleId("boat"),
            SPORTSBOAT_PROFILE,
            drive,
          );
          const deckSeatRiders = sitting.map((on, seat) =>
            on ? asPlayerId(`deck${seat}`) : undefined,
          );
          const { eye, view } = looking({ x: 0, z: 0 }, aimed);
          boat.requestSeat(asPlayerId("guest"), eye, view);
          const layout =
            boat.tick(input([], { deckSeatRiders })).seatLayout ?? [];
          const seat = layout.indexOf(asPlayerId("guest"));
          if (sitting.every(Boolean)) expect(seat).toBe(-1);
          else expect(sitting[seat]).toBe(false);
        },
      ),
    );
  });

  it("seats a touch player, who gives no line of sight, in the free seat nearest where they stand, whichever way the boat faces", () => {
    fc.assert(
      fc.property(yawArb, seatArb, (yaw, seat) => {
        const boat = createVehicle("sportsboat", asVehicleId("boat"), yaw);
        const at = seatAt(yaw, seat);
        boat.requestSeat(asPlayerId("touch"), { x: at.x, y: 1.6, z: at.z });
        const layout = boat.tick(input([])).seatLayout ?? [];
        expect(layout.indexOf(asPlayerId("touch"))).toBe(seat);
      }),
    );
  });

  it("boards each deck-seat rider into the boat seat of their deck seat when the boat sets off (ADR 0063)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        (sitting) => {
          const drive: Drive = {
            speed: 0,
            yaw: 0,
            resync: () => {},
            onDriverMounted: () => {},
            onSeatVacated: () => [],
            step: () => ({ ...NO_COMMANDS, boardDeckRiders: true }),
          };
          const boat = new Vehicle(
            asVehicleId("boat"),
            SPORTSBOAT_PROFILE,
            drive,
          );
          const deckSeatRiders = sitting.map((on, seat) =>
            on ? asPlayerId(`deck${seat}`) : undefined,
          );
          const layout = boat.tick(input([], { deckSeatRiders })).seatLayout;
          expect(layout).toEqual(riderOrder(deckSeatRiders));
        },
      ),
    );
  });
});
