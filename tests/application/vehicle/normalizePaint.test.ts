import fc from "fast-check";
import { expect, it } from "vitest";
import { NormalizePaint } from "../../../src/application/vehicle/normalizePaint";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { PAINTS } from "../../../src/domain/shared/paint";
import { FakeWorld } from "./fakes";

it("resets every saved nonzero camper variant to zero, without dye or sound", () => {
  fc.assert(
    fc.property(fc.constantFrom(...PAINTS.slice(1)), (paint) => {
      const world = new FakeWorld();
      world.kinds.set("a", "camper");
      world.paints.set("a", paint);
      const useCase = new NormalizePaint(world);
      expect(useCase.normalizeFixedPaint(asVehicleId("a"))).toBe(true);
      expect(world.paints.get("a")).toBe("khaki");
      expect(world.calls).toEqual(["paint:a:khaki"]);
      expect(world.sounds).toEqual([]);
      expect(useCase.normalizeFixedPaint(asVehicleId("a"))).toBe(false);
      expect(world.calls).toEqual(["paint:a:khaki"]);
    }),
  );
});

it.each(["suv", "sportsboat", "bulldozer", "camper"] as const)(
  "leaves %s alone when no normalization is needed",
  (kind) => {
    const world = new FakeWorld();
    world.kinds.set("a", kind);
    world.paints.set("a", kind === "camper" ? "khaki" : "gray");
    expect(
      new NormalizePaint(world).normalizeFixedPaint(asVehicleId("a")),
    ).toBe(false);
    expect(world.calls).toEqual([]);
    expect(world.sounds).toEqual([]);
  },
);

it("leaves a missing vehicle alone", () => {
  const world = new FakeWorld();
  expect(
    new NormalizePaint(world).normalizeFixedPaint(asVehicleId("gone")),
  ).toBe(false);
  expect(world.calls).toEqual([]);
});
