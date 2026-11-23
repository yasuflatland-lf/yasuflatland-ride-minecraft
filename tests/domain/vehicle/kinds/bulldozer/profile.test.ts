import { expect, it } from "vitest";
import { BULLDOZER_PROFILE as P } from "../../../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  BULLDOZER_WIDE_BLADE,
  BULLDOZER_SPEC as S,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/spec";

it("puts one exit beside the left track and behind the blade", () => {
  expect(P.seatExits).toEqual([S.doorExit]);
  expect(P.seatExits).toHaveLength(P.seats.positions.length);
  expect(S.doorExit.x - 0.3).toBeGreaterThan(18.8 / 16);
  expect(S.doorExit.z).toBeLessThan(S.blade.near);
});

it("caps the ram at the wide blade's half width", () => {
  expect(P.maxRamHalfWidth).toBe(BULLDOZER_WIDE_BLADE.halfWidth);
});
