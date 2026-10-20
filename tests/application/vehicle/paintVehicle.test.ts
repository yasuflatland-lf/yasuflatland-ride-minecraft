import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PaintVehicle } from "../../../src/application/vehicle/paintVehicle";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import { PAINTS, type Paint } from "../../../src/domain/vehicle/paint";
import { FakeWorld } from "./fakes";

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
        expect(
          new PaintVehicle(world).execute({
            playerId: "p",
            vehicleId: "a",
            paint: to,
            creative,
            tick: 0,
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
        expect(
          new PaintVehicle(world).execute({
            playerId: "p",
            vehicleId: "a",
            paint: color,
            creative: false,
            tick: 0,
          }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }),
    );
  });

  it("does nothing for a vehicle that no longer exists", () => {
    const world = new FakeWorld();
    expect(
      new PaintVehicle(world).execute({
        playerId: "p",
        vehicleId: "gone",
        paint: "red",
        creative: false,
        tick: 0,
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
        const useCase = new PaintVehicle(world);
        const hit = (playerId: string, tick: number) =>
          useCase.execute({
            playerId,
            vehicleId: "a",
            paint: to,
            creative: false,
            tick,
          });
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
        const useCase = new PaintVehicle(world);
        for (const [playerId, color] of [
          ["p", first],
          ["q", second],
        ] as const)
          useCase.execute({
            playerId,
            vehicleId: "a",
            paint: color,
            creative: false,
            tick: 7,
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
          const useCase = new PaintVehicle(world);
          const hit = (color: Paint, at: number) =>
            useCase.execute({
              playerId: "p",
              vehicleId: "a",
              paint: color,
              creative: false,
              tick: at,
            });
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
          const blackish = (p: Paint) => p === "khaki" || p === "black";
          const same =
            kind === "sportsboat"
              ? from === to || (blackish(from) && blackish(to))
              : from === to;
          const uc = new PaintVehicle(world);
          expect(
            uc.execute({
              playerId: "p",
              vehicleId: "a",
              paint: to,
              creative,
              tick: 0,
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
        const uc = new PaintVehicle(world);
        expect(
          uc.execute({
            playerId: "p",
            vehicleId: "a",
            paint: to,
            creative: false,
            tick: 0,
          }),
        ).toBe(false);
        expect(world.calls).toEqual([]);
      }
    }
  });

  it("does nothing when the vehicle's kind is unknown", () => {
    const world = new KindlessWorld();
    world.paints.set("a", "red");
    const uc = new PaintVehicle(world);
    expect(
      uc.execute({
        playerId: "p",
        vehicleId: "a",
        paint: "green",
        creative: false,
        tick: 0,
      }),
    ).toBe(false);
    expect(world.calls).toEqual([]);
  });

  it("does nothing to a vehicle removed after a repaint in the same tick (ADR 0037, 0076)", () => {
    const world = new FakeWorld();
    world.paints.set("a", "khaki");
    const uc = new PaintVehicle(world);
    const hit = (color: Paint) =>
      uc.execute({
        playerId: "p",
        vehicleId: "a",
        paint: color,
        creative: false,
        tick: 5,
      });
    expect(hit("red")).toBe(true);
    world.paints.delete("a");
    expect(hit("green")).toBe(false);
    expect(world.calls).toEqual(["paint:a:red", "dye:p:red"]);
  });
});
