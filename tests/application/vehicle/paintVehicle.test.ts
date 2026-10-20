import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintVehicle } from "../../../src/application/vehicle/paintVehicle";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { PAINTS, type Paint } from "../../../src/domain/vehicle/paint/paint";
import { FakeClock, FakeWorld } from "./fakes";

const paint = fc.constantFrom(...PAINTS);

class KindlessWorld extends FakeWorld {
  override kindOf() {
    return undefined;
  }
}

// The engine applies a paint event's variant on the next tick, so paintOf
// still reports the old color for the rest of the tick it was painted in.
class LaggingWorld extends FakeWorld {
  private readonly applied = new Map<string, Paint>();
  override paintOf(id: string) {
    return this.applied.get(id);
  }
  setApplied(id: string, paint: Paint) {
    this.applied.set(id, paint);
    this.paints.set(id, paint);
  }
  nextTick() {
    for (const [id, paint] of this.paints) this.applied.set(id, paint);
  }
}

describe("PaintVehicle (ADR 0031)", () => {
  it("repaints to a different color, and consumes the dye only outside creative", () => {
    fc.assert(
      fc.property(paint, paint, fc.boolean(), (from, to, creative) => {
        fc.pre(from !== to);
        const world = new FakeWorld();
        world.paints.set("a", from);
        if (creative) world.creativePlayers.add("p");
        const clock = new FakeClock();
        expect(
          new PaintVehicle(world, clock).execute({
            playerId: asPlayerId("p"),
            vehicleId: asVehicleId("a"),
            paint: to,
          }),
        ).toBe(true);
        expect(world.paints.get("a")).toBe(to);
        expect(world.calls).toEqual(
          creative ? [`paint:a:${to}`] : [`paint:a:${to}`, `dye:p:${to}`],
        );
      }),
    );
  });

  it("does nothing, and keeps the dye, when the vehicle already has that color", () => {
    fc.assert(
      fc.property(paint, (color) => {
        const world = new FakeWorld();
        world.paints.set("a", color);
        const clock = new FakeClock();
        expect(
          new PaintVehicle(world, clock).execute({
            playerId: asPlayerId("p"),
            vehicleId: asVehicleId("a"),
            paint: color,
          }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }),
    );
  });

  it("does nothing for a vehicle that no longer exists", () => {
    const world = new FakeWorld();
    const clock = new FakeClock();
    expect(
      new PaintVehicle(world, clock).execute({
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("gone"),
        paint: "red",
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });

  it("uses one dye when the same paint arrives twice before the engine applies it (ADR 0037)", () => {
    fc.assert(
      fc.property(paint, paint, (from, to) => {
        fc.pre(from !== to);
        const world = new LaggingWorld();
        world.setApplied("a", from);
        const clock = new FakeClock();
        const useCase = new PaintVehicle(world, clock);
        const hit = (playerId: string, tick: number) => {
          clock.tick = tick;
          return useCase.execute({
            playerId: asPlayerId(playerId),
            vehicleId: asVehicleId("a"),
            paint: to,
          });
        };
        expect(hit("p", 7)).toBe(true);
        expect(hit("q", 7)).toBe(false);
        world.nextTick();
        expect(hit("p", 8)).toBe(false);
        expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
      }),
    );
  });

  it("still repaints when a different paint arrives in the same tick", () => {
    fc.assert(
      fc.property(paint, paint, paint, (from, first, second) => {
        fc.pre(from !== first && first !== second);
        const world = new LaggingWorld();
        world.setApplied("a", from);
        const clock = new FakeClock();
        const useCase = new PaintVehicle(world, clock);
        clock.tick = 7;
        for (const [playerId, color] of [
          ["p", first],
          ["q", second],
        ] as const)
          useCase.execute({
            playerId: asPlayerId(playerId),
            vehicleId: asVehicleId("a"),
            paint: color,
          });
        expect(world.calls).toEqual([
          `paint:a:${first}`,
          `dye:p:${first}`,
          `paint:a:${second}`,
          `dye:q:${second}`,
        ]);
      }),
    );
  });

  it("trusts the world's color again on a later tick, so a vehicle removed after a paint takes no more dye (ADR 0037)", () => {
    fc.assert(
      fc.property(
        paint,
        paint,
        paint,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100 }),
        (from, to, next, tick, later) => {
          fc.pre(from !== to);
          fc.pre(next !== to);
          const world = new FakeWorld();
          world.paints.set("a", from);
          const clock = new FakeClock();
          const useCase = new PaintVehicle(world, clock);
          const hit = (color: Paint, at: number) => {
            clock.tick = at;
            return useCase.execute({
              playerId: asPlayerId("p"),
              vehicleId: asVehicleId("a"),
              paint: color,
            });
          };
          expect(hit(to, tick)).toBe(true);
          world.paints.delete("a");
          expect(hit(next, tick + later)).toBe(false);
          expect(world.calls).toEqual([`paint:a:${to}`, `dye:p:${to}`]);
        },
      ),
    );
  });

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
          const same =
            kind === "sportsboat"
              ? from === to || (blackish(from) && blackish(to))
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

  it("does nothing to a vehicle removed after a repaint in the same tick (ADR 0037, 0076)", () => {
    const world = new FakeWorld();
    world.paints.set("a", "khaki");
    const clock = new FakeClock();
    const uc = new PaintVehicle(world, clock);
    clock.tick = 5;
    const hit = (color: Paint) =>
      uc.execute({
        playerId: asPlayerId("p"),
        vehicleId: asVehicleId("a"),
        paint: color,
      });
    expect(hit("red")).toBe(true);
    world.paints.delete("a");
    expect(hit("green")).toBe(false);
    expect(world.calls).toEqual(["paint:a:red", "dye:p:red"]);
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
