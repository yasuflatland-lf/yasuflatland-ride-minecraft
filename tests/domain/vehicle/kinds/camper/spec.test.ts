import { expect, it } from "vitest";
import { CAMPER_PROFILE } from "../../../../../src/domain/vehicle/kinds/camper/profile";
import {
  deckSeats,
  departure,
} from "../../../../../src/domain/vehicle/kinds/camper/roomCells";
import {
  CEILING_LAYER,
  INSIDE_LAYERS,
  ROOF_LAYER,
} from "../../../../../src/domain/vehicle/kinds/camper/roomGeometry";
import {
  CAMPER_SPEC,
  CAMPER_TRANSFORMING,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";

it("preserves the camper's body dimensions and step probe spacing", () => {
  expect(CAMPER_PROFILE.body).toEqual({
    front: 3.7,
    halfWidth: 1.5,
    height: 4,
  });
  expect(CAMPER_SPEC.bodyRear).toBe(3.9);
  expect(CAMPER_TRANSFORMING.stepLaneOffset).toBe(0.8);
});

it("positions the four parked seats and the toilet at their exact rises", () => {
  const pose = { x: 0.5, y: 0, z: 0.5, yaw: 0 };
  expect(deckSeats(pose).map(({ y }) => y)).toEqual([
    0.98, 0.98, 0.68, 0.68, 0.68,
  ]);
  expect(CAMPER_PROFILE.boarding).toMatchObject({ aimHeight: 1.35 });
});

it("uses the parked room's standing heights for departure and driver hints", () => {
  const pose = { x: 0.5, y: 0, z: 0.5, yaw: 0 };
  expect(departure(pose).boxes[0]).toMatchObject({
    min: { y: 0.5 },
    max: { y: 3.5 },
  });
  expect(CAMPER_PROFILE.hints?.driverSeat?.feet).toEqual([0.5, 3.5]);
  expect(INSIDE_LAYERS).toEqual([1, 2]);
  expect(CEILING_LAYER).toBe(3);
  expect(ROOF_LAYER).toBe(4);
});
