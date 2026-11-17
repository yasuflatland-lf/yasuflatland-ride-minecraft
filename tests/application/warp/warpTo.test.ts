import fc from "fast-check";
import { expect, it } from "vitest";
import { WarpTo } from "../../../src/application/warp/warpTo";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { nether, player, point, setup } from "./fakes";

function warp(e: ReturnType<typeof setup>) {
  return new WarpTo(e.store, e.world, e.feedback, e.ticks);
}

it("teleports to a standable side in the target dimension or falls back above", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.boolean(),
      fc.integer({ min: -100, max: 100 }),
      async (safe, x) => {
        const target = {
          ...point(),
          dimension: nether,
          cell: { x, y: 70, z: -3 },
        };
        const e = setup({ points: [target] });
        const side = { ...target.cell, x: x + 1 };
        if (safe) e.world.standable.add(JSON.stringify([nether, side]));
        await warp(e).run(player, target.id);
        expect(e.world.teleports).toEqual([
          {
            playerId: player,
            dimension: nether,
            feet: safe ? side : { ...target.cell, y: 71 },
          },
        ]);
        expect(e.store.writes).toEqual([]);
        expect(e.ticks.waits).toEqual([]);
      },
    ),
  );
});

it("waits for an unverified arrival then removes only the gone point", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.world.presences.set(target.id, "unloaded");
  e.ticks.onWait = () => {
    if (e.ticks.waits.length === 2) {
      e.world.presences.set(target.id, "gone");
      e.store.registry = { points: [target, point(1)] };
    }
  };
  await warp(e).run(player, target.id);
  expect(e.world.teleports).toHaveLength(1);
  expect(e.ticks.waits).toEqual([
    WARP_SPEC.arrivalCheckTicks,
    WARP_SPEC.arrivalCheckTicks,
  ]);
  expect(e.store.registry?.points).toEqual([point(1)]);
  expect(e.feedback.gone).toEqual([{ playerId: player, point: target }]);
});

it("keeps an unverified point when it loads present or reaches the deadline", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({
        min: 1,
        max: WARP_SPEC.arrivalCheckMaxTicks / WARP_SPEC.arrivalCheckTicks + 1,
      }),
      async (loadAfter) => {
        const target = point();
        const e = setup({ points: [target] });
        e.world.presences.set(target.id, "unloaded");
        e.ticks.onWait = () => {
          if (e.ticks.waits.length === loadAfter)
            e.world.presences.set(target.id, "present");
        };
        await warp(e).run(player, target.id);
        expect(e.ticks.waits.reduce((sum, ticks) => sum + ticks, 0)).toBe(
          Math.min(
            loadAfter * WARP_SPEC.arrivalCheckTicks,
            WARP_SPEC.arrivalCheckMaxTicks,
          ),
        );
        expect(e.store.writes).toEqual([]);
        expect(e.store.registry?.points).toEqual([target]);
        expect(e.feedback.gone).toEqual([]);
      },
    ),
  );
});

it("checks a gone block at the arrival deadline", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.world.presences.set(target.id, "unloaded");
  e.ticks.onWait = () => {
    if (
      e.ticks.waits.reduce((sum, ticks) => sum + ticks, 0) ===
      WARP_SPEC.arrivalCheckMaxTicks
    )
      e.world.presences.set(target.id, "gone");
  };
  await warp(e).run(player, target.id);
  expect(e.store.registry?.points).toEqual([]);
  expect(e.feedback.gone).toEqual([{ playerId: player, point: target }]);
});

it("reports teleport failure without waiting or changing the registry", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.world.presences.set(target.id, "unloaded");
  e.world.teleportSucceeds = false;
  await warp(e).run(player, target.id);
  expect(e.feedback.failed).toEqual([player]);
  expect(e.ticks.waits).toEqual([]);
  expect(e.store.writes).toEqual([]);
});

it("rejects a point already known to be gone before teleporting", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.world.presences.set(target.id, "gone");
  await warp(e).run(player, target.id);
  expect(e.world.teleports).toEqual([]);
  expect(e.store.registry?.points).toEqual([]);
  expect(e.feedback.gone).toEqual([{ playerId: player, point: target }]);
});

it("never writes a registry that becomes unreadable during arrival", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.world.presences.set(target.id, "unloaded");
  e.ticks.onWait = () => {
    e.store.registry = undefined;
    e.world.presences.set(target.id, "gone");
  };
  await warp(e).run(player, target.id);
  expect(e.store.writes).toEqual([]);
  expect(e.feedback.unreadable).toEqual([player]);
});
