import { expect, expectTypeOf, it } from "vitest";
import { TOILET_SPEC, WASHSTAND_SPEC } from "../../../src/domain/resort/shows";
import type { SoundId } from "../../../src/domain/shared/soundId";
import type { Ticks } from "../../../src/domain/shared/ticks";

it("uses branded durations and sound ids for show tuning", () => {
  expectTypeOf(TOILET_SPEC.flushTicks).toEqualTypeOf<Ticks>();
  expectTypeOf(TOILET_SPEC.lidOpenTicks).toEqualTypeOf<Ticks>();
  expectTypeOf(TOILET_SPEC.scanTicks).toEqualTypeOf<Ticks>();
  expectTypeOf(WASHSTAND_SPEC.runTicks).toEqualTypeOf<Ticks>();
  expectTypeOf(TOILET_SPEC.flushSound).toEqualTypeOf<SoundId>();
  expectTypeOf(WASHSTAND_SPEC.runSound).toEqualTypeOf<SoundId>();
});

it("deeply freezes both show specs", () => {
  function expectFrozen(value: unknown): void {
    if (value === null || typeof value !== "object") return;
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectFrozen(child);
  }
  expectFrozen(TOILET_SPEC);
  expectFrozen(WASHSTAND_SPEC);
});
