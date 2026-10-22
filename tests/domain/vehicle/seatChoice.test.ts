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
  aimPoint,
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

const SEATS = SPORTSBOAT_PROFILE.seats.positions;
const AIM_HEIGHT = SPORTSBOAT_SPEC.seatAimHeight;
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

describe("aimPoint (ADR 0120)", () => {
  it("is where a downward line of sight crosses the seat height", () => {
    fc.assert(
      fc.property(
        coord,
        fc.double({ min: 0.6, max: 4, noNaN: true }),
        coord,
        yawArb,
        seatArb,
        (x, up, z, yaw, seat) => {
          const target = seatAt(yaw, seat);
          const eye = { x, y: AIM_HEIGHT + up, z };
          const d = {
            x: target.x - eye.x,
            y: target.y - eye.y,
            z: target.z - eye.z,
          };
          const n = Math.hypot(d.x, d.y, d.z);
          const view = { x: d.x / n, y: d.y / n, z: d.z / n };
          const aim = aimPoint(eye, view, AIM_HEIGHT);
          expect(dist(aim, target)).toBeLessThan(1e-6);
        },
      ),
    );
  });

  it("falls back to the point of a level or rising sight line nearest the center, never behind the eye", () => {
    fc.assert(
      fc.property(
        coord,
        coord,
        coord,
        coord,
        fc.double({ min: 0, max: 1, noNaN: true }),
        (x, z, vx, vz, vy) => {
          const eye = { x, y: AIM_HEIGHT + 1, z };
          const aim = aimPoint(eye, { x: vx, y: vy, z: vz }, AIM_HEIGHT);
          const flat = vx * vx + vz * vz;
          // On the forward ray from the eye.
          const t = flat > 0 ? ((aim.x - x) * vx + (aim.z - z) * vz) / flat : 0;
          expect(t).toBeGreaterThanOrEqual(-1e-9);
          expect(aim.x).toBeCloseTo(x + vx * t, 6);
          expect(aim.z).toBeCloseTo(z + vz * t, 6);
          // No point of that ray is nearer the center.
          for (const s of [0, 0.5, 1, 2, 8])
            expect(Math.hypot(aim.x, aim.z)).toBeLessThanOrEqual(
              Math.hypot(x + vx * s, z + vz * s) + 1e-6,
            );
        },
      ),
    );
  });
});

describe("chooseSeat (ADR 0120)", () => {
  it("picks the free seat nearest the aim, and nothing when every seat is taken", () => {
    fc.assert(
      fc.property(coord, coord, assignmentArb, (x, z, seats) => {
        const aim = { x, z };
        const seat = chooseSeat(aim, SEATS, seats);
        const free = SEATS.map((_, i) => i).filter(
          (i) => seats[i] === undefined,
        );
        if (free.length === 0) {
          expect(seat).toBeUndefined();
          return;
        }
        expect(seat).toBeDefined();
        const chosen = seat as number;
        expect(seats[chosen]).toBeUndefined();
        for (const other of free)
          expect(dist(aim, SEATS[chosen] as Vec2)).toBeLessThanOrEqual(
            dist(aim, SEATS[other] as Vec2),
          );
      }),
    );
  });

  it("gives a player aiming at a rear seat that seat while the driver's seat is taken, not the front passenger's", () => {
    for (const rear of [2, 3]) {
      fc.assert(
        fc.property(
          coord,
          fc.double({ min: 0.6, max: 3, noNaN: true }),
          coord,
          yawArb,
          (x, up, z, yaw) => {
            const target = seatAt(yaw, rear);
            const eye = { x, y: AIM_HEIGHT + up, z };
            const view = {
              x: target.x - eye.x,
              y: target.y - eye.y,
              z: target.z - eye.z,
            };
            const aim = aimPoint(eye, view, AIM_HEIGHT);
            const f = forward(yaw);
            const l = leftOf(f);
            const local = {
              x: aim.x * l.x + aim.z * l.z,
              z: aim.x * f.x + aim.z * f.z,
            };
            expect(chooseSeat(local, SEATS, [IDS[0]])).toBe(rear);
          },
        ),
      );
    }
  });
});

describe("settleSeats (ADR 0120)", () => {
  it("seats every rider once, keeps each staying rider's seat, and seats requests only in free seats", () => {
    fc.assert(
      fc.property(
        assignmentArb,
        fc.subarray(IDS),
        fc.array(fc.tuple(fc.constantFrom(...IDS), coord, coord), {
          maxLength: 4,
        }),
        (previous, aboardIds, asks) => {
          const aboard = aboardIds.map((id, slot) => ({ id, slot }));
          const requests = new Map(asks.map(([id, x, z]) => [id, { x, z }]));
          const { seats, boarding } = settleSeats(
            { seats: previous, boarding: new Set() },
            aboard,
            requests,
            SEATS,
          );
          const taken = seats.filter((id) => id !== undefined);
          expect(new Set(taken).size).toBe(taken.length);
          // Every rider aboard has a seat while seats last.
          const seatedAboard = aboardIds.filter((id) => seats.includes(id));
          expect(seatedAboard.length).toBe(
            Math.min(aboardIds.length, SEATS.length),
          );
          const driverLeft =
            previous[0] !== undefined && !aboardIds.includes(previous[0]);
          for (const [seat, id] of previous.entries()) {
            if (id === undefined || !aboardIds.includes(id)) continue;
            const handedOver = driverLeft && seat === 1 && seats[0] === id;
            expect(handedOver || seats[seat] === id).toBe(true);
          }
          // A request never moves anyone aboard, and only players not aboard board.
          for (const id of boarding) {
            expect(aboardIds.includes(id)).toBe(false);
            expect(requests.has(id)).toBe(true);
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
      SEATS,
    );
    expect(after.seats).toEqual([front, undefined, undefined, rear]);
    const rearOnly = settleSeats(
      { seats: [driver, undefined, rear], boarding: new Set() },
      [{ id: rear, slot: 1 }],
      new Map(),
      SEATS,
    );
    expect(rearOnly.seats).toEqual([undefined, undefined, rear, undefined]);
  });

  it("does not take a player who was about to get in and did not for a driver who left", () => {
    const [missed, front] = IDS as [PlayerId, PlayerId];
    const after = settleSeats(
      { seats: [missed, front], boarding: new Set([missed]) },
      [{ id: front, slot: 1 }],
      new Map(),
      SEATS,
    );
    expect(after.seats).toEqual([undefined, front, undefined, undefined]);
  });

  it("seats a rider the engine seated by their slot when it is free, else in the lowest free seat", () => {
    const [a, b, c] = IDS as [PlayerId, PlayerId, PlayerId];
    const after = settleSeats(
      { seats: [undefined, undefined, a], boarding: new Set() },
      [
        { id: a, slot: 1 },
        { id: b, slot: 2 },
        { id: c, slot: 3 },
      ],
      new Map(),
      SEATS,
    );
    expect(after.seats).toEqual([b, undefined, a, c]);
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
        const chosen = new ChosenSeats(SEATS);
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
            chosen.request(step.ask, SEATS[step.seat] as Vec2);
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
  return {
    id: asPlayerId(id),
    offset: { x: at.x, z: at.z },
    yaw: 0,
    raw: { moveX: 0, moveY: 0, jump: false },
    slot,
  };
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

  it("boards each deck-seat rider into the boat seat of their deck seat when the boat sets off (ADR 0063)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        (sitting) => {
          const drive: Drive = {
            speed: 0,
            yaw: 0,
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

it("starts with no seats", () => {
  expect(settleSeats(NONE, [], new Map(), SEATS).seats).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});
