import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintVehicle } from "../../../src/application/vehicle/paintVehicle";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { PAINTS, type Paint } from "../../../src/domain/shared/paint";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
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
          const blackish = (p: Paint) => p === "khaki" || p === "black";
          // The variant-0 slot shows the owner's default paint, white for the scooter (ADR 0076).
          const scooterShown = (p: Paint) => (p === "khaki" ? "white" : p);
          const same =
            kind === "camper"
              ? true
              : kind === "sportsboat"
                ? from === to || (blackish(from) && blackish(to))
                : kind === "bulldozer"
                  ? from === to ||
                    (["khaki", "yellow"].includes(from) &&
                      ["khaki", "yellow"].includes(to))
                  : kind === "scooter"
                    ? scooterShown(from) === scooterShown(to)
                    : from === to;
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

  it("black or brown dye on a new or black sports boat keeps the dye (ADR 0076)", () => {
    for (const from of ["khaki", "black"] as const) {
      for (const to of ["black", "khaki"] as const) {
        const world = new FakeWorld();
        world.paints.set("a", from);
        world.kinds.set("a", "sportsboat");
        const clock = new FakeClock();
        const uc = new PaintVehicle(world, clock);
        expect(
          uc.execute({
            playerId: asPlayerId("p"),
            vehicleId: asVehicleId("a"),
            paint: to,
          }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }
    }
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

it("asks the world about creative mode for the painting player only", () => {
  fc.assert(
    fc.property(paint, paint, fc.boolean(), (from, to, otherCreative) => {
      fc.pre(from !== to);
      const world = new FakeWorld();
      world.paints.set("a", from);
      world.kinds.set("a", "suv");
      if (otherCreative) world.creativePlayers.add("q");
      expect(
        new PaintVehicle(world, new FakeClock()).execute({
          playerId: asPlayerId("p"),
          vehicleId: asVehicleId("a"),
          paint: to,
        }),
      ).toBe(true);
      expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
    }),
  );
});

it("checks the policy before reading paint, including repeat hits", () => {
  class ReadOrderWorld extends FakeWorld {
    readonly reads: string[] = [];
    override paintOf(id: string) {
      this.reads.push("paintOf");
      return super.paintOf(id);
    }
    override kindOf(id: string) {
      this.reads.push("kindOf");
      return super.kindOf(id);
    }
  }
  const world = new ReadOrderWorld();
  world.paints.set("a", "khaki");
  const useCase = new PaintVehicle(world, new FakeClock());
  const cmd = {
    playerId: asPlayerId("p"),
    vehicleId: asVehicleId("a"),
    paint: "red" as const,
  };
  expect(useCase.execute(cmd)).toBe(true);
  expect(world.reads).toEqual(["kindOf", "paintOf", "kindOf"]);
  world.reads.length = 0;
  expect(useCase.execute(cmd)).toBe(false);
  expect(world.reads).toEqual(["kindOf", "kindOf"]);
});

it.each(PAINTS)(
  "ignores camper dye %s in Survival and Creative without any effects",
  (to) => {
    for (const creative of [false, true]) {
      for (const from of PAINTS) {
        const world = new FakeWorld();
        world.paints.set("camper", from);
        world.kinds.set("camper", "camper");
        if (creative) world.creativePlayers.add("p");
        expect(
          new PaintVehicle(world, new FakeClock()).execute({
            playerId: asPlayerId("p"),
            vehicleId: asVehicleId("camper"),
            paint: to,
          }),
        ).toBe(false);
        expect(world.paints.get("camper")).toBe(from);
        expect(world.calls).toEqual([]);
        expect(world.sounds).toEqual([]);
      }
    }
  },
);
