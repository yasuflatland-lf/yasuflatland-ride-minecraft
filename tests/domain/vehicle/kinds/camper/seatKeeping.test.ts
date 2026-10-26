import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../../src/domain/shared/ids";
import { CAMPER_PROFILE } from "../../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { createVehicle } from "../../../../../src/domain/vehicle/kinds/index";
import { DOCK } from "../../../../../src/domain/vehicle/motion/dock";
import { riderOrder } from "../../../../../src/domain/vehicle/seatChoice";
import type {
  RiderView,
  VehicleTickInput,
} from "../../../../../src/domain/vehicle/vehicle";
import { defined } from "../../../../support/defined";

const IDLE = { moveX: 0, moveY: 0, jump: false };
const PUSH = { ...IDLE, moveY: 1 };
const driver: RiderView = {
  id: asPlayerId("driver"),
  offset: defined(CAMPER_PROFILE.seats.positions[0], "driver seat"),
  slot: 0,
  yaw: 0,
  raw: IDLE,
};

function departure(
  sitting: readonly boolean[],
  toilet: boolean,
  aboard: boolean,
) {
  const camper = createVehicle("camper", asVehicleId("camper"), 0);
  const input: VehicleTickInput = {
    tick: 0,
    riders: aboard ? [driver] : [],
    deckSeatInputs: [],
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: (p) => p.y < 0,
    waterAt: () => false,
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
    targets: () => [],
  };
  for (let tick = 0; tick <= DOCK.ticks; tick++) {
    input.tick = tick;
    camper.tick(input);
  }
  expect(camper.tick({ ...input, tick: DOCK.ticks + 1 }).dock).toBeDefined();
  const seats = sitting.map((on, i) =>
    on ? asPlayerId(`deck${i}`) : undefined,
  );
  const out = camper.tick({
    ...input,
    tick: DOCK.ticks + 2,
    riders: aboard ? [{ ...driver, raw: PUSH }] : [],
    testInput: aboard || sitting[0] ? undefined : PUSH,
    deckSeatInputs: seats.map((id, i) =>
      id ? (i === 0 ? PUSH : IDLE) : undefined,
    ),
    deckSeatRiders: [...seats, toilet ? asPlayerId("toilet") : undefined],
  });
  expect(out.boardDeckRiders).toBe(true);
  const expected = aboard ? [driver.id, ...seats.slice(1)] : seats;
  expect(out.seatLayout).toEqual(riderOrder(expected));
  expect(out.seatLayout).not.toContain("toilet");
  return out;
}

it("keeps any set of deck riders in their seats and excludes the toilet rider (ADR 0154)", () => {
  fc.assert(
    fc.property(
      fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
      fc.boolean(),
      (sitting, toilet) => {
        departure(sitting, toilet, false);
      },
    ),
  );
});

it("boards the deck driver with the dinette passenger in seat 2", () => {
  departure([true, false, true, false], false, false);
});

it("departs with the driver already in vehicle seat 0 and the dinette passenger in seat 3", () => {
  expect(
    departure([false, false, false, true], true, true).depart,
  ).toBeDefined();
});

it("keeps camper aim balls disjoint with an aim height between both rideable heights (ADR 0154)", () => {
  const positions = CAMPER_PROFILE.seats.positions;
  for (const [i, a] of positions.entries())
    for (const b of positions.slice(i + 1))
      expect(2 * CAMPER_SPEC.seatAimRadius).toBeLessThan(
        Math.hypot(a.x - b.x, a.z - b.z),
      );
  const heights: number[] = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/entities/yasu_ride/camper.se.json",
      "utf8",
    ),
  )["minecraft:entity"].components["minecraft:rideable"].seats.map(
    (seat: { position: number[] }) => seat.position[1],
  );
  expect(CAMPER_SPEC.seatAimHeight).toBeGreaterThan(Math.min(...heights));
  expect(CAMPER_SPEC.seatAimHeight).toBeLessThan(Math.max(...heights));
});
