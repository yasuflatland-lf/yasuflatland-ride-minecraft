import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { PaintVehicle } from "../../../src/application/vehicle/paintVehicle";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import {
  effectivePaint,
  isDyeable,
  PAINTS,
} from "../../../src/domain/shared/paint";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import { FakeClock, FakeWorld } from "./fakes";

const paint = fc.constantFrom(...PAINTS);

class KindlessWorld extends FakeWorld {
  override kindOf() {
    return undefined;
  }
}

describe("PaintVehicle (ADR 0031)", () => {
  it("repaints exactly when the shown color changes, per kind (ADR 0076)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VEHICLE_KINDS),
        paint,
        paint,
        fc.boolean(),
        (kind, from, to, creative) => {
          const world = new FakeWorld();
          world.paints.set("a", from);
          world.kinds.set("a", kind);
          if (creative) world.creativePlayers.add("p");
          const policy = profileOf(kind).paintPolicy;
          const same =
            !isDyeable(policy) ||
            (policy.kind === "dyeable" &&
              effectivePaint(from, policy.defaultPaint) ===
                effectivePaint(to, policy.defaultPaint));
          const clock = new FakeClock();
          const uc = new PaintVehicle(world, clock);
          expect(
            uc.execute({
              playerId: asPlayerId("p"),
              vehicleId: asVehicleId("a"),
              paint: to,
            }),
          ).toBe(!same);
          if (same) {
            expect(world.calls).toEqual([]);
            expect(world.paints.get("a")).toBe(from);
          } else {
            expect(world.calls).toEqual(
              creative ? [`paint:a:${to}`] : [`paint:a:${to}`, `dye:p:${to}`],
            );
          }
        },
      ),
    );
  });

  it("does nothing when the vehicle's kind is unknown", () => {
    const world = new KindlessWorld();
    world.paints.set("a", "red");
    const clock = new FakeClock();
    const uc = new PaintVehicle(world, clock);
    expect(
      uc.execute({
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("a"),
        paint: "green",
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });
});

it("does not read or write paint for a camper", () => {
  const world = new FakeWorld();
  world.kinds.set("a", "camper");
  const read = vi.spyOn(world, "paintOf");
  expect(
    new PaintVehicle(world, new FakeClock()).execute({
      playerId: asPlayerId("p"),
      vehicleId: asVehicleId("a"),
      paint: "red",
    }),
  ).toBe(false);
  expect(read).not.toHaveBeenCalled();
  expect(world.calls).toEqual([]);
  expect(world.sounds).toEqual([]);
});
