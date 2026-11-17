import fc from "fast-check";
import { expect, it } from "vitest";
import { OpenWarpList } from "../../../src/application/warp/openWarpList";
import { RegisterWarpPoint } from "../../../src/application/warp/registerWarpPoint";
import { RemoveWarpPoint } from "../../../src/application/warp/removeWarpPoint";
import { RenameWarpPoint } from "../../../src/application/warp/renameWarpPoint";
import { WarpTo } from "../../../src/application/warp/warpTo";
import type { BlockPresence } from "../../../src/domain/warp/presence";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { nether, overworld, player, point, setup } from "./fakes";

function list(e: ReturnType<typeof setup>) {
  return new OpenWarpList(
    e.store,
    e.world,
    e.players,
    e.menus,
    e.feedback,
    new WarpTo(e.store, e.world, e.feedback, e.ticks),
  );
}

it("opening the list loses only points whose blocks are gone", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom<BlockPresence>("present", "unloaded", "gone"), {
        maxLength: WARP_SPEC.maxPoints,
      }),
      async (presences) => {
        const points = presences.map((_, index) => point(index));
        const e = setup({ points });
        points.forEach((p, index) => {
          e.world.presences.set(p.id, presences[index] ?? "present");
        });
        await list(e).run(player);
        const kept = points.filter((_, index) => presences[index] !== "gone");
        expect(e.store.registry?.points).toEqual(kept);
        expect(e.store.writes).toHaveLength(presences.includes("gone") ? 1 : 0);
        expect(e.feedback.empty).toEqual(kept.length ? [] : [player]);
        for (const { page } of e.menus.pages) {
          expect(
            page.entries.every(
              ({ point, unverified }) =>
                unverified === (e.world.presences.get(point.id) === "unloaded"),
            ),
          ).toBe(true);
        }
      },
    ),
  );
});

it("orders the current dimension by distance and follows page answers", async () => {
  const e = setup({
    points: [
      { ...point(20), dimension: nether },
      ...Array.from({ length: WARP_SPEC.pageSize + 1 }, (_, i) =>
        point(i),
      ).reverse(),
    ],
  });
  e.world.presences.set(point(0).id, "unloaded");
  e.menus.listAnswers.push(
    { kind: "page", pageIndex: 1 },
    { kind: "page", pageIndex: -10 },
    { kind: "cancelled" },
  );
  await list(e).run(player);
  expect(
    e.menus.pages.map(({ page }) => [page.pageIndex, page.pageCount]),
  ).toEqual([
    [0, 2],
    [1, 2],
    [0, 2],
  ]);
  expect(e.menus.pages[0]?.page.entries.map(({ point }) => point.id)).toEqual(
    Array.from({ length: WARP_SPEC.pageSize }, (_, i) => point(i).id),
  );
  expect(e.menus.pages[0]?.page.entries[0]).toEqual({
    point: point(0),
    unverified: true,
  });
  expect(e.menus.pages[1]?.page.entries.map(({ point }) => point.id)).toEqual([
    point(16).id,
    point(20).id,
  ]);
});

it("uses the current registry when a menu answer selects a warp", async () => {
  const target = point();
  const e = setup({ points: [target] });
  e.menus.listAnswers.push({ kind: "warp", id: target.id });
  await list(e).run(player);
  expect(e.world.teleports).toEqual([
    { playerId: player, dimension: overworld, feet: { x: 0, y: 65, z: 0 } },
  ]);

  e.world.teleports = [];
  e.menus.listAnswers.push({ kind: "warp", id: target.id });
  e.menus.beforeListAnswer = () => new RemoveWarpPoint(e.store).run(target);
  await list(e).run(player);
  expect(e.world.teleports).toEqual([]);
});

it("ends a busy menu or a list request from an absent player", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (absent) => {
      const e = setup({ points: [point()] });
      if (absent) e.players.locations.delete(player);
      e.menus.listAnswers.push({ kind: "busy" });
      await list(e).run(player);
      expect(e.menus.pages).toHaveLength(absent ? 0 : 1);
      expect(e.world.teleports).toEqual([]);
      expect(e.store.writes).toEqual([]);
    }),
  );
});

it("no use case ever writes an initially unreadable store", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 20 }),
      async (operations) => {
        const e = setup();
        e.store.registry = undefined;
        const target = point();
        for (const operation of operations) {
          switch (operation) {
            case 0:
              expect(
                await new RegisterWarpPoint(
                  e.store,
                  e.players,
                  e.menus,
                  e.feedback,
                  e.ticks,
                ).run({ ...target, playerId: player }),
              ).toBe("unavailable");
              break;
            case 1:
              new RemoveWarpPoint(e.store).run(target);
              break;
            case 2:
              await new RenameWarpPoint(
                e.store,
                e.menus,
                e.feedback,
                e.ticks,
              ).run({ ...target, playerId: player });
              break;
            case 3:
              await list(e).run(player);
              break;
            case 4:
              await new WarpTo(e.store, e.world, e.feedback, e.ticks).run(
                player,
                target.id,
              );
              break;
          }
        }
        expect(e.store.writes).toEqual([]);
        expect(e.store.registry).toBeUndefined();
        expect(e.feedback.unreadable).toEqual(
          operations.filter((op) => op !== 1).map(() => player),
        );
        expect(e.menus.nameRequests).toEqual([]);
        expect(e.menus.pages).toEqual([]);
        expect(e.world.teleports).toEqual([]);
      },
    ),
  );
});
