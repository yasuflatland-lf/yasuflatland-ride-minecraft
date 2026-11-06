import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import type {
  EditKind,
  PlannedChange,
} from "../../../src/domain/build/edit/change";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  nether,
  overworld,
} from "./fakes";

const owner = asPlayerId("owner");
const other = asPlayerId("other");
const feet = { x: -2, y: 64, z: 3 };
const head = { ...feet, y: feet.y + 1 };
const stone = blockStateOf("minecraft:stone");
function setup() {
  const repo = new FakeSessions();
  const world = new FakeWorld();
  const players = new FakeBuildPlayers();
  const log = { warn: vi.fn() };
  players.occupants.set(owner, { dimensionId: overworld, feet });
  const jobs = new EditJobs(repo, world, new FakeFeedback(), log, players);
  const start = (
    plan: Iterable<PlannedChange>,
    kind: EditKind = "undoable",
    player = owner,
  ) => {
    repo.getOrCreate(player).beginEdit();
    jobs.start(player, overworld, plan, kind);
  };
  return { repo, world, players, log, jobs, start };
}

it("moves only the owner after every edit kind writes feet or head", () => {
  fc.assert(
    fc.property(
      fc.constantFrom<EditKind>("undoable", "undo", "irreversible"),
      fc.boolean(),
      (kind, atHead) => {
        const e = setup();
        e.players.occupants.set(other, { dimensionId: overworld, feet });
        e.start([{ cell: atHead ? head : feet, after: stone }], kind);
        e.jobs.step();
        expect(e.players.moves).toEqual([
          { playerId: owner, cell: { ...feet, y: atHead ? 66 : 65 } },
        ]);
      },
    ),
  );
});

it("escapes above the dimension ceiling when no air pair exists below it", () => {
  const e = setup();
  const netherFeet = { ...feet, y: 100 };
  e.players.occupants.set(owner, { dimensionId: nether, feet: netherFeet });
  e.world.topYs.set(nether, 127);
  for (let y = netherFeet.y + 1; y <= 127; y++) {
    e.world.put({ ...netherFeet, y }, blockStateOf("minecraft:netherrack"));
  }
  for (let y = 128; y <= BUILD_SPEC.worldTopY; y++) {
    e.world.unreadableCells.add(cellKey({ ...netherFeet, y }));
  }
  e.repo.getOrCreate(owner).beginEdit();
  e.jobs.start(owner, nether, [{ cell: netherFeet, after: stone }], "undoable");
  e.jobs.step();
  expect(e.players.moves).toEqual([
    { playerId: owner, cell: { ...netherFeet, y: 128 } },
  ]);
});

it.each(["minecraft:tall_grass", "minecraft:water", "minecraft:lava"])(
  "leaves an untouched owner in %s",
  (type) => {
    const e = setup();
    e.world.put(feet, blockStateOf(type));
    e.start([{ cell: { ...feet, x: 10 }, after: stone }]);
    e.jobs.step();
    expect(e.players.moves).toEqual([]);
  },
);

it.each(["unchanged", "refused", "protected", "unreadable", "conflict"])(
  "ignores a %s write at the owner",
  (reason) => {
    const e = setup();
    e.world.put(feet, stone);
    const key = cellKey(feet);
    if (reason === "refused") e.world.refusedCells.add(key);
    if (reason === "protected") e.world.protectedCells.add(key);
    if (reason === "unreadable") e.world.unreadableCells.add(key);
    e.start([
      {
        cell: feet,
        after: reason === "unchanged" ? stone : blockStateOf("minecraft:dirt"),
        ...(reason === "conflict" ? { expected: AIR } : {}),
      },
    ]);
    e.jobs.step();
    expect(e.players.moves).toEqual([]);
  },
);

it.each(["riding or disconnected", "different dimension"])(
  "does not track an owner who is %s",
  (condition) => {
    const e = setup();
    if (condition === "different dimension")
      e.players.occupants.set(owner, { dimensionId: nether, feet });
    else e.players.occupants.delete(owner);
    e.start([{ cell: feet, after: stone }]);
    e.jobs.step();
    expect(e.players.moves).toEqual([]);
  },
);

it.each(["absent", "dimension", "open", "unreadable"])(
  "rechecks the owner at completion: %s",
  (condition) => {
    const e = setup();
    function* plan() {
      yield { cell: feet, after: stone };
      if (condition === "absent") e.players.occupants.delete(owner);
      if (condition === "dimension")
        e.players.occupants.set(owner, { dimensionId: nether, feet });
      if (condition === "open")
        e.world.put(feet, blockStateOf("minecraft:water"));
      if (condition === "unreadable")
        e.world.unreadableCells.add(cellKey(feet));
    }
    e.start(plan());
    e.jobs.step();
    expect(e.players.moves).toEqual([]);
  },
);

it("does not move after a plan fails even after a successful owner write", () => {
  const e = setup();
  function* plan() {
    yield { cell: feet, after: stone };
    throw new Error("plan failed");
  }
  e.start(plan());
  e.jobs.step();
  expect(e.players.moves).toEqual([]);
  expect(e.log.warn).toHaveBeenCalled();
});

it("isolates movement failure from history completion and another job", () => {
  const e = setup();
  vi.spyOn(e.players, "moveTo").mockImplementation(() => {
    throw new Error("teleport failed");
  });
  e.start([{ cell: feet, after: stone }]);
  e.start([{ cell: { ...feet, x: 20 }, after: stone }], "undoable", other);
  e.jobs.step();
  expect(e.repo.get(owner)?.hasHistory).toBe(true);
  expect(e.repo.get(other)?.hasHistory).toBe(true);
  expect(e.repo.get(owner)?.isEditing).toBe(false);
  expect(e.log.warn).toHaveBeenCalledWith(expect.stringContaining("unstuck"));
});

it("reads occupancy once per run and uses the current column on later ticks", () => {
  const e = setup();
  const read = vi.spyOn(e.players, "occupantOf");
  const later = { ...feet, x: feet.x + 1 };
  const plan = Array.from({ length: BUILD_SPEC.blocksPerTick }, () => ({
    cell: { ...feet, x: 20 },
    after: stone,
  }));
  e.start([...plan, { cell: later, after: stone }]);
  e.jobs.step();
  expect(read).toHaveBeenCalledTimes(1);
  e.players.occupants.set(owner, { dimensionId: overworld, feet: later });
  e.jobs.step();
  expect(read).toHaveBeenCalledTimes(3);
  expect(e.players.moves).toEqual([
    { playerId: owner, cell: { ...later, y: later.y + 1 } },
  ]);
});
