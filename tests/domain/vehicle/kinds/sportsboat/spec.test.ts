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
  it("reads every motion limit from the spec", () => {
    for (const key of Object.keys(
      SPORTSBOAT_MOTION,
    ) as (keyof typeof SPORTSBOAT_MOTION)[]) {
      expect(SPORTSBOAT_MOTION[key]).toBe(SPORTSBOAT_SPEC[key]);
    }
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
});
