import fc from "fast-check";
import { expect, it } from "vitest";
import { FinishRotateMode } from "../../../src/application/build/finishRotateMode";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import type { BuildFlow } from "../../../src/domain/build/flow/flow";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeSessions, FakeWorld, overworld } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
it("finishes with the last box and material while preserving history and world", () => {
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), (x) => {
      const repo = new FakeSessions();
      const world = new FakeWorld();
      const structures = new FakeStructureStore(world);
      const session = repo.getOrCreate(playerId);
      const box = boxOf({ x, y: 0, z: 0 }, { x: x + 4, y: 3, z: 2 });
      const material = blockStateOf("minecraft:stone");
      const handle = structures.capture(overworld, box, playerId);
      if (
        typeof handle !== "string" ||
        handle === "tooLarge" ||
        handle === "unreadable"
      )
        throw new Error("Missing snapshot");
      session.recordSnapshot({ dimensionId: overworld, box, handle });
      structures.calls.length = 0;
      session.setFlow(beginRotateMode(overworld, box, material, 3));
      const finish = new FinishRotateMode(repo);
      expect(finish.execute({ playerId })).toBe("finished");
      expect(session.flow).toEqual({
        kind: "endpoint",
        dimensionId: overworld,
        from: box.min,
        to: box.max,
        material,
      });
      expect(session.hasHistory).toBe(true);
      expect(structures.calls).toEqual([]);
      expect(world.writes).toBe(0);
      expect(finish.execute({ playerId })).toBe("ignored");
    }),
  );
});

it("ignores absent sessions and idle flows without creating a session", () => {
  const repo = new FakeSessions();
  const finish = new FinishRotateMode(repo);
  expect(finish.execute({ playerId })).toBe("ignored");
  expect(repo.get(playerId)).toBeUndefined();
  const session = repo.getOrCreate(playerId);
  const flow = session.flow;
  expect(finish.execute({ playerId })).toBe("ignored");
  expect(session.flow).toBe(flow);
});

it("ignores all non-rotation flow kinds without changing session state", () => {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const finish = new FinishRotateMode(repo);
  const material = blockStateOf("minecraft:stone");
  const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 4, y: 2, z: 1 });
  const flows: BuildFlow[] = [
    { kind: "idle" },
    { kind: "point1", dimensionId: overworld, cell: box.min, material },
    {
      kind: "endpoint",
      dimensionId: overworld,
      from: box.min,
      to: box.max,
      material,
    },
    {
      kind: "heightStep",
      dimensionId: overworld,
      base: box,
      from: box.min,
      heightedKind: "rotate",
      previous: 3,
      heightLocked: false,
      material,
    },
    {
      kind: "terrainConfirm",
      dimensionId: overworld,
      from: box.min,
      to: box.max,
      material,
      op: "fillBelow",
    },
    { kind: "pasteAim", turn: 2 },
  ];
  for (const flow of flows) {
    session.setFlow(flow);
    const before = structuredClone(session);
    expect(finish.execute({ playerId })).toBe("ignored");
    expect(session).toEqual(before);
    expect(session.flow).toBe(flow);
  }
});
