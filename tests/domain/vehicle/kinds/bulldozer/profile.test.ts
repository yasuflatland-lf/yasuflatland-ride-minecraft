import { expect, it } from "vitest";
import {
  entityContractOf,
  fleetLimitOf,
} from "../../../../../src/domain/vehicle/kinds";
import { BULLDOZER_ENTITY } from "../../../../../src/domain/vehicle/kinds/bulldozer/entity";
import {
  BULLDOZER_TYRES,
  BULLDOZER_MOTION as M,
  BULLDOZER_PROFILE as P,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  BULLDOZER_AIR,
  BULLDOZER_WATER,
  BULLDOZER_SPEC as S,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  kindOfEntity,
  kindOfItem,
} from "../../../../../src/infrastructure/vehicle/bedrock/identifiers";

it("gives the bulldozer its body, one seat, beams, fleet limit, and yellow paint (ADR 0136)", () => {
  expect(P).toMatchObject({
    kind: "bulldozer",
    fleetLimit: 1,
    body: { front: 2.4, halfWidth: 2.32, height: 2.9 },
    footprint: 3.35,
    seats: { positions: [{ x: 0, z: -1.35 }] },
    boarding: { order: "engine" },
    beams: { lanes: [0] },
    placement: {
      surfaces: ["top"],
      clearance: { halfX: 4, halfZ: 4, height: 3 },
    },
    chaseCamera: "far",
    defaultPaint: "yellow",
  });
  expect(P.beams.reach).toBe(S.headlightReach);
  expect(P.beams.levels).toBe(S.headlightLevels);
  expect(P.standIn).toBeUndefined();
  expect(M).toMatchObject({ maxSpeed: 0.45, turnRate: 3, grip: 1 });
  expect(BULLDOZER_TYRES).toEqual({ handbrakeGrip: 1, creepSpeed: 0 });
  expect(fleetLimitOf("bulldozer")).toBe(1);
  expect(entityContractOf("bulldozer")).toBe(BULLDOZER_ENTITY);
  expect(kindOfEntity("yasu_ride:bulldozer")).toBe("bulldozer");
  expect(kindOfItem("yasu_ride:bulldozer_item")).toBe("bulldozer");
});
it("caps water and flight speed at the ground top speed", () => {
  expect(Math.min(M.maxSpeed, BULLDOZER_WATER.maxSpeed)).toBe(0.45);
  expect(Math.min(M.maxSpeed, BULLDOZER_AIR.maxSpeed)).toBe(0.45);
});

it("puts one exit beside the left track and behind the blade", () => {
  expect(P.seatExits).toEqual([S.doorExit]);
  expect(P.seatExits).toHaveLength(P.seats.positions.length);
  expect(S.doorExit.x - 0.3).toBeGreaterThan(18.8 / 16);
  expect(S.doorExit.z).toBeLessThan(S.blade.near);
});
