import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { RiderWatch } from "../../../src/application/shared/riderWatch";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";

const ids = [0, 1, 2];
const idArb = fc.constantFrom(...ids);
const playerArb = fc.constantFrom("alice", "bob", "carol").map(asPlayerId);
const operationArb = fc.oneof(
  fc.record({
    kind: fc.constant("note"),
    id: idArb,
    player: playerArb,
  }),
  fc.record({
    kind: fc.constant("rider"),
    id: idArb,
    player: fc.option(playerArb, { nil: undefined }),
  }),
  fc.record({
    kind: fc.constant("refresh"),
    loaded: fc.uniqueArray(idArb),
  }),
);

it("reports each observed dismount exactly once and never reports unloaded ids", () => {
  fc.assert(
    fc.property(fc.array(operationArb, { maxLength: 100 }), (operations) => {
      const world = new Map<number, PlayerId>();
      let observed = new Map<number, PlayerId>();
      const onGone = vi.fn();
      const onSeated = vi.fn();
      const riderOf = vi.fn((id: number) => world.get(id));
      const watch = new RiderWatch({ riderOf }, { onGone, onSeated });
      const expectedGone: [number, PlayerId][] = [];
      const expectedSeated: [number, PlayerId][] = [];

      const refresh = (loaded: readonly number[]) => {
        const snapshot = new Map(
          loaded.flatMap((id): [number, PlayerId][] => {
            const player = world.get(id);
            return player === undefined ? [] : [[id, player]];
          }),
        );
        for (const id of loaded) {
          const previous = observed.get(id);
          if (previous !== undefined && previous !== snapshot.get(id))
            expectedGone.push([id, previous]);
        }
        expectedSeated.push(...snapshot);
        observed = snapshot;

        riderOf.mockClear();
        watch.refresh(loaded);
        expect(riderOf.mock.calls).toEqual(loaded.map((id) => [id]));
        expect(onGone.mock.calls).toEqual(expectedGone);
        expect(onSeated.mock.calls).toEqual(expectedSeated);
      };

      for (const operation of operations) {
        switch (operation.kind) {
          case "note":
            world.set(operation.id, operation.player);
            observed.set(operation.id, operation.player);
            watch.note(operation.id, operation.player);
            break;
          case "rider":
            if (operation.player === undefined) world.delete(operation.id);
            else world.set(operation.id, operation.player);
            break;
          case "refresh":
            refresh(operation.loaded);
            break;
        }
        expect(onGone.mock.calls).toEqual(expectedGone);
        expect(onSeated.mock.calls).toEqual(expectedSeated);
      }

      world.clear();
      refresh(ids);
      refresh(ids);
    }),
  );
});

it("forgets the previous rider before a throwing onGone so it cannot repeat", () => {
  const player = asPlayerId("alice");
  const onGone = vi.fn(() => {
    throw new Error("Exit failed");
  });
  const watch = new RiderWatch<number>(
    { riderOf: () => undefined },
    { onGone },
  );
  watch.note(0, player);

  expect(() => watch.refresh([0])).toThrow("Exit failed");
  expect(() => watch.refresh([0])).not.toThrow();
  expect(onGone).toHaveBeenCalledExactlyOnceWith(0, player);
});

it("tracks riders discovered on refresh without an onSeated handler", () => {
  const player = asPlayerId("alice");
  const world = new Map([["seat", player]]);
  const onGone = vi.fn();
  const watch = new RiderWatch<string>(
    { riderOf: (id) => world.get(id) },
    { onGone },
  );

  watch.refresh(["seat"]);
  watch.refresh(["seat"]);
  expect(onGone).not.toHaveBeenCalled();
  world.clear();
  watch.refresh(["seat"]);
  watch.refresh(["seat"]);
  expect(onGone).toHaveBeenCalledExactlyOnceWith("seat", player);
});

it("reports the replaced rider before seating and remembers a rider even if onSeated throws", () => {
  const previous = asPlayerId("alice");
  const current = asPlayerId("bob");
  const world = new Map([[0, current]]);
  const events: [string, number, PlayerId][] = [];
  const watch = new RiderWatch<number>(
    { riderOf: (id) => world.get(id) },
    {
      onGone: (id, player) => events.push(["gone", id, player]),
      onSeated: (id, player) => {
        events.push(["seated", id, player]);
        throw new Error("Pose failed");
      },
    },
  );
  watch.note(0, previous);

  expect(() => watch.refresh([0])).toThrow("Pose failed");
  world.clear();
  watch.refresh([0]);
  watch.refresh([0]);
  expect(events).toEqual([
    ["gone", 0, previous],
    ["seated", 0, current],
    ["gone", 0, current],
  ]);
});
