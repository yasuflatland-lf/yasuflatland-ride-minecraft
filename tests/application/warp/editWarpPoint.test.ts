import fc from "fast-check";
import { expect, it } from "vitest";
import { RemoveWarpPoint } from "../../../src/application/warp/removeWarpPoint";
import { RenameWarpPoint } from "../../../src/application/warp/renameWarpPoint";
import type { WarpName } from "../../../src/domain/warp/warpName";
import { named, nether, player, point, setup } from "./fakes";

it("removes only the point at the requested dimension and cell", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 20 }), (index) => {
      const target = point(index);
      const other = {
        ...point(index + 1),
        dimension: nether,
        cell: target.cell,
      };
      const e = setup({ points: [target, other] });
      new RemoveWarpPoint(e.store).run(target);
      expect(e.store.registry?.points).toEqual([other]);
      new RemoveWarpPoint(e.store).run(target);
      expect(e.store.writes).toHaveLength(1);
    }),
  );
});

it("renames the current point while preserving concurrent additions", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.menus.nameAnswers.push({ kind: "name", name: named("New name") });
  e.menus.beforeNameAnswer = () => {
    e.store.registry = { points: [target, point(1)] };
  };
  await new RenameWarpPoint(e.store, e.menus, e.feedback, e.ticks).run({
    ...target,
    playerId: player,
  });
  expect(e.menus.nameRequests).toEqual([
    { playerId: player, current: target.name },
  ]);
  expect(e.store.registry?.points.map((p) => p.name)).toEqual([
    "New name",
    "Warp 2",
  ]);
});

it("ignores cancelled and empty edits", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (cancelled) => {
      const target = point();
      const e = setup({ points: [target] });
      e.menus.nameAnswers.push(
        cancelled
          ? { kind: "cancelled" }
          : { kind: "name", name: "  " as WarpName },
      );
      await new RenameWarpPoint(e.store, e.menus, e.feedback, e.ticks).run({
        ...target,
        playerId: player,
      });
      expect(e.store.writes).toEqual([]);
    }),
  );
});

it("does not recreate a point removed while its form was open", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.menus.nameAnswers.push({ kind: "name", name: named("Too late") });
  e.menus.beforeNameAnswer = () => new RemoveWarpPoint(e.store).run(target);
  await new RenameWarpPoint(e.store, e.menus, e.feedback, e.ticks).run({
    ...target,
    playerId: player,
  });
  expect(e.store.registry?.points).toEqual([]);
  expect(e.store.writes).toHaveLength(1);
});

it("does not save an answered rename if the store has become unreadable", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.menus.nameAnswers.push({ kind: "name", name: named("Home") });
  e.menus.beforeNameAnswer = () => {
    e.store.registry = undefined;
  };
  await new RenameWarpPoint(e.store, e.menus, e.feedback, e.ticks).run({
    ...target,
    playerId: player,
  });
  expect(e.store.registry).toBeUndefined();
  expect(e.store.writes).toEqual([]);
  expect(e.feedback.unreadable).toEqual([player]);
});
