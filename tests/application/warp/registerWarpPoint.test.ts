import fc from "fast-check";
import { expect, it } from "vitest";
import { RegisterWarpPoint } from "../../../src/application/warp/registerWarpPoint";
import { RemoveWarpPoint } from "../../../src/application/warp/removeWarpPoint";
import { cellOf } from "../../../src/domain/shared/cells";
import { WARP_SPEC } from "../../../src/domain/warp/spec";
import { named, overworld, player, point, setup } from "./fakes";

const command = {
  playerId: player,
  dimension: overworld,
  cell: cellOf({ x: -4, y: 70, z: 5 }),
};
function register(e: ReturnType<typeof setup>) {
  return new RegisterWarpPoint(
    e.store,
    e.players,
    e.menus,
    e.feedback,
    e.ticks,
  );
}

it("saves the default before retrying a busy name form", async () => {
  const e = setup({ points: [point(1)] });
  e.menus.nameAnswers.push(
    { kind: "busy" },
    { kind: "busy" },
    { kind: "name", name: named("Home") },
  );
  e.menus.beforeNameAnswer = () => {
    expect(e.store.registry?.points[1]).toMatchObject({
      name: "Warp 1",
      owner: "Player Name",
      dimension: overworld,
      cell: command.cell,
    });
  };
  expect(await register(e).run(command)).toBe("registered");
  expect(e.ticks.waits).toEqual([
    WARP_SPEC.formRetryTicks,
    WARP_SPEC.formRetryTicks,
  ]);
  expect(e.store.registry?.points.map((p) => p.name)).toEqual([
    "Warp 2",
    "Home",
  ]);
});

it("keeps the default after cancellation or exhausting busy retries", async () => {
  await fc.assert(
    fc.asyncProperty(fc.boolean(), async (busy) => {
      const e = setup();
      e.menus.nameAnswers = Array.from(
        { length: WARP_SPEC.formMaxRetries + 2 },
        () => ({ kind: busy ? ("busy" as const) : ("cancelled" as const) }),
      );
      expect(await register(e).run(command)).toBe("registered");
      expect(e.store.registry?.points[0]?.name).toBe("Warp 1");
      expect(e.store.writes).toHaveLength(1);
      expect(e.menus.nameRequests).toHaveLength(
        busy ? WARP_SPEC.formMaxRetries + 1 : 1,
      );
      expect(e.ticks.waits).toEqual(
        Array(busy ? WARP_SPEC.formMaxRetries : 0).fill(
          WARP_SPEC.formRetryTicks,
        ),
      );
    }),
  );
});

it("never grows a full registry or asks for a name", async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: -1000, max: -1 }), async (x) => {
      const points = Array.from({ length: WARP_SPEC.maxPoints }, (_, i) =>
        point(i),
      );
      const e = setup({ points });
      expect(
        await register(e).run({
          ...command,
          cell: cellOf({ ...command.cell, x }),
        }),
      ).toBe("full");
      expect(e.store.registry?.points).toEqual(points);
      expect(e.store.writes).toEqual([]);
      expect(e.feedback.full).toEqual([player]);
      expect(e.menus.nameRequests).toEqual([]);
    }),
  );
});

it("does not overwrite concurrent registration when applying a name", async () => {
  const e = setup();
  const useCase = register(e);
  e.menus.nameAnswers.push(
    { kind: "name", name: named("First") },
    { kind: "cancelled" },
  );
  let second: Promise<string> | undefined;
  e.menus.beforeNameAnswer = () => {
    e.menus.beforeNameAnswer = () => {};
    second = useCase.run({
      ...command,
      cell: cellOf({ ...command.cell, x: 100 }),
    });
  };
  await useCase.run(command);
  await second;
  expect(e.store.registry?.points.map((p) => p.name)).toEqual([
    "First",
    "Warp 2",
  ]);
  expect(new Set(e.store.registry?.points.map((p) => p.id)).size).toBe(2);
});

it("does not rename a replacement point when an old registration form answers", async () => {
  const e = setup();
  e.menus.nameAnswers.push(
    { kind: "name", name: named("Old answer") },
    { kind: "cancelled" },
  );
  let replacement: Promise<string> | undefined;
  e.menus.beforeNameAnswer = () => {
    e.menus.beforeNameAnswer = () => {};
    new RemoveWarpPoint(e.store).run(command);
    replacement = register(e).run(command);
  };
  await register(e).run(command);
  await replacement;
  expect(e.store.registry?.points.map((p) => p.name)).toEqual(["Warp 1"]);
});

it("never overwrites data that becomes unreadable while the name form is open", async () => {
  const e = setup();
  e.menus.nameAnswers.push({ kind: "name", name: named("Home") });
  e.menus.beforeNameAnswer = () => {
    e.store.registry = undefined;
  };
  expect(await register(e).run(command)).toBe("unavailable");
  expect(e.store.writes).toHaveLength(1);
  expect(e.store.registry).toBeUndefined();
  expect(e.feedback.unreadable).toEqual([player]);
});
