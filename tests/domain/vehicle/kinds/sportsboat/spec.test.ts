import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SPORTSBOAT_ATTITUDE } from "../../../../../src/domain/vehicle/kinds/sportsboat/attitude";
import {
  DECK,
  DECK_DRAFT,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/deck";
import {
  SPORTSBOAT_DRAG,
  SPORTSBOAT_WATER,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/drive";
import { SPORTSBOAT_ENTITY } from "../../../../../src/domain/vehicle/kinds/sportsboat/entity";
import {
  SPORTSBOAT_MOTION,
  SPORTSBOAT_PROFILE,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../../../src/domain/vehicle/kinds/sportsboat/spec";

describe("SPORTSBOAT_SPEC (ADR 0087)", () => {
  it("freezes the table and every object derived from it", () => {
    for (const table of [
      SPORTSBOAT_SPEC,
      SPORTSBOAT_MOTION,
      SPORTSBOAT_PROFILE.body,
      SPORTSBOAT_DRAG,
      SPORTSBOAT_WATER,
      SPORTSBOAT_ATTITUDE,
    ]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });

  it("reads every motion limit from the spec", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ...(Object.keys(
            SPORTSBOAT_MOTION,
          ) as (keyof typeof SPORTSBOAT_MOTION)[]),
        ),
        (key) => SPORTSBOAT_MOTION[key] === SPORTSBOAT_SPEC[key],
      ),
    );
  });

  it("reads the ram reach, water drag, attitude and deck from the spec", () => {
    expect(SPORTSBOAT_PROFILE.body).toStrictEqual({
      front: SPORTSBOAT_SPEC.ramFront,
      halfWidth: SPORTSBOAT_SPEC.ramHalfWidth,
      height: SPORTSBOAT_SPEC.height,
    });
    expect(SPORTSBOAT_DRAG).toStrictEqual({
      initial: SPORTSBOAT_SPEC.waterDragInitial,
      min: SPORTSBOAT_SPEC.waterDragMin,
      max: SPORTSBOAT_SPEC.waterDragMax,
      smoothing: SPORTSBOAT_SPEC.waterDragSmoothing,
      minGiven: SPORTSBOAT_SPEC.waterDragMinGiven,
    });
    expect(SPORTSBOAT_WATER).toStrictEqual({
      drag: SPORTSBOAT_SPEC.waterDragInitial,
      maxSpeed: SPORTSBOAT_SPEC.maxSpeed,
    });
    expect(SPORTSBOAT_ATTITUDE).toStrictEqual({
      maxTrim: SPORTSBOAT_SPEC.maxTrim,
      trimRiseRate: SPORTSBOAT_SPEC.trimRiseRate,
      trimSettleRate: SPORTSBOAT_SPEC.trimSettleRate,
      maxRoll: SPORTSBOAT_SPEC.maxRoll,
      rollRate: SPORTSBOAT_SPEC.rollRate,
    });
    expect(DECK_DRAFT).toBe(SPORTSBOAT_SPEC.deckDraft);
    expect(DECK.margin).toBe(SPORTSBOAT_SPEC.deckMargin);
    expect(SPORTSBOAT_ENTITY.properties.trim.range).toStrictEqual([
      0,
      SPORTSBOAT_SPEC.maxTrim,
    ]);
    expect(SPORTSBOAT_ENTITY.properties.roll.range).toStrictEqual([
      -SPORTSBOAT_SPEC.maxRoll,
      SPORTSBOAT_SPEC.maxRoll,
    ]);
  });

  it("keeps the values of ADR 0051, 0053, 0061, 0063 and 0085", () => {
    expect(SPORTSBOAT_SPEC).toMatchObject({
      height: 1.2,
      ramFront: 3,
      ramHalfWidth: 1.06,
      waterDragInitial: 0.83,
      waterDragMin: 0.7,
      waterDragMax: 0.95,
      waterDragSmoothing: 0.1,
      waterDragMinGiven: 0.05,
      maxTrim: 3.5,
      trimRiseRate: 0.25,
      trimSettleRate: 0.125,
      maxRoll: 20,
      rollRate: 2,
      deckDraft: 0.45,
      deckMargin: 0.3,
    });
  });
});
