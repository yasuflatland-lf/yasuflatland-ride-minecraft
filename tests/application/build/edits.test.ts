import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CopySelection } from "../../../src/application/build/copySelection";
import { EditJobs } from "../../../src/application/build/editJobs";
import { FillSelection } from "../../../src/application/build/fillSelection";
import { PasteClipboard } from "../../../src/application/build/pasteClipboard";
import { ReplaceInSelection } from "../../../src/application/build/replaceInSelection";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  cellKey,
  FakeAnchor,
  FakeFeedback,
  FakeSessions,
  FakeWorld,
  overworld,
} from "./fakes";

const alex = asPlayerId("alex");
const blake = asPlayerId("blake");
const stone = blockStateOf("minecraft:stone");
const dirt = blockStateOf("minecraft:dirt");
const sign = blockStateOf("minecraft:standing_sign");

function setup() {
  const repo = new FakeSessions();
  const anchor = new FakeAnchor();
  const feedback = new FakeFeedback();
  const world = new FakeWorld();
  const jobs = new EditJobs(repo, world, feedback);
  return {
    repo,
    anchor,
    feedback,
    world,
    jobs,
    fill: new FillSelection(repo, feedback, jobs),
    replace: new ReplaceInSelection(repo, world, feedback, jobs),
    copy: new CopySelection(repo, anchor, world, feedback),
    paste: new PasteClipboard(repo, anchor, world, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
  };
}

type Env = ReturnType<typeof setup>;

function select(env: Env, player: typeof alex, size: number, y = 64) {
  const s = env.repo.getOrCreate(player);
  s.setCorner("pos1", overworld, { x: 0, y, z: 0 });
  s.setCorner("pos2", overworld, { x: size - 1, y, z: size - 1 });
}

function runAll(env: Env, maxSteps = 1000) {
  for (
    let i = 0;
    i < maxSteps && env.repo.ids().some((id) => env.repo.get(id)?.isEditing);
    i++
  ) {
    env.jobs.step();
  }
}

function snapshot(world: FakeWorld, size: number, y = 64) {
  const out: string[] = [];
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      out.push(JSON.stringify(world.stateAt(overworld, { x, y, z })));
  return out;
}

describe("EditJobs properties", () => {
  it("fill then undo restores every cell", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.tuple(fc.nat(11), fc.nat(11)), { maxLength: 20 }),
        (size, dirtCells) => {
          const env = setup();
          for (const [x, z] of dirtCells) env.world.put({ x, y: 64, z }, dirt);
          const before = snapshot(env.world, 12);
          select(env, alex, size);
          env.fill.execute({ playerId: alex, pattern: { state: stone } });
          runAll(env);
          env.undo.execute({ playerId: alex });
          runAll(env);
          expect(snapshot(env.world, 12)).toEqual(before);
        },
      ),
    );
  });

  it("never writes a kept or protected cell", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(24), { maxLength: 10 }),
        fc.array(fc.nat(24), { maxLength: 10 }),
        (keptIdx, protectedIdx) => {
          const env = setup();
          const at = (i: number) => ({ x: i % 5, y: 64, z: Math.floor(i / 5) });
          for (const i of keptIdx) env.world.put(at(i), sign);
          for (const i of protectedIdx)
            env.world.protectedCells.add(cellKey(at(i)));
          select(env, alex, 5);
          env.fill.execute({ playerId: alex, pattern: { state: stone } });
          runAll(env);
          for (const i of keptIdx) {
            expect(env.world.stateAt(overworld, at(i))).toEqual(sign);
          }
          for (const i of protectedIdx) {
            const s = env.world.stateAt(overworld, at(i));
            expect(s).not.toEqual(stone);
          }
        },
      ),
    );
  });

  it("never writes or records a cell the world cannot read", () => {
    fc.assert(
      fc.property(fc.array(fc.nat(24), { maxLength: 10 }), (unreadableIdx) => {
        const env = setup();
        const at = (i: number) => ({ x: i % 5, y: 64, z: Math.floor(i / 5) });
        for (const i of unreadableIdx)
          env.world.unreadableCells.add(cellKey(at(i)));
        select(env, alex, 5);
        env.fill.execute({ playerId: alex, pattern: { state: stone } });
        runAll(env);
        const unreadable = new Set(unreadableIdx);
        expect(env.world.writes).toBe(25 - unreadable.size);
        expect(env.feedback.messages.at(-1)).toEqual({
          message: "editDone",
          count: 25 - unreadable.size,
        });
      }),
    );
  });

  it("applies at most blocksPerTick changes per step", () => {
    const env = setup();
    const s = env.repo.getOrCreate(alex);
    s.setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    s.setCorner("pos2", overworld, { x: 63, y: 3, z: 63 });
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    let last = 0;
    for (let i = 0; i < 5; i++) {
      env.jobs.step();
      expect(env.world.writes - last).toBeLessThanOrEqual(
        BUILD_SPEC.blocksPerTick,
      );
      last = env.world.writes;
    }
    expect(last).toBeGreaterThan(0);
  });

  it("lets two players' jobs both progress within two steps", () => {
    const env = setup();
    for (const p of [alex, blake]) {
      const s = env.repo.getOrCreate(p);
      const y = p === alex ? 0 : 100;
      s.setCorner("pos1", overworld, { x: 0, y, z: 0 });
      s.setCorner("pos2", overworld, { x: 63, y: y + 3, z: 63 });
      env.fill.execute({ playerId: p, pattern: { state: stone } });
    }
    env.jobs.step();
    env.jobs.step();
    expect(env.world.stateAt(overworld, { x: 0, y: 0, z: 0 })).toEqual(stone);
    expect(env.world.stateAt(overworld, { x: 0, y: 100, z: 0 })).toEqual(stone);
  });
});

describe("edit use cases", () => {
  it("refuses without a selection and when busy", () => {
    const env = setup();
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    env.replace.execute({
      playerId: alex,
      mask: { typeId: "minecraft:air" },
      pattern: { state: stone },
    });
    env.copy.execute({ playerId: alex });
    env.paste.execute({ playerId: alex, skipAir: false });
    env.undo.execute({ playerId: alex });
    expect(env.feedback.messages.map((m) => m.message)).toEqual([
      "noSelection",
      "noSelection",
      "noSelection",
      "noClipboard",
      "nothingToUndo",
    ]);
    env.feedback.messages = [];
    select(env, alex, 2);
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    env.fill.execute({ playerId: alex, pattern: { state: dirt } });
    env.undo.execute({ playerId: alex });
    expect(env.feedback.messages.map((m) => m.message)).toEqual([
      "busy",
      "busy",
    ]);
  });

  it("refuses a selection larger than the edit limit", () => {
    const env = setup();
    const s = env.repo.getOrCreate(alex);
    s.setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    s.setCorner("pos2", overworld, { x: 99, y: 99, z: 99 });
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    expect(env.feedback.messages.at(-1)?.message).toBe("tooLarge");
  });

  it("reports the number of changed blocks and replaces only matches", () => {
    const env = setup();
    env.world.put({ x: 0, y: 64, z: 0 }, dirt);
    select(env, alex, 3);
    env.replace.execute({
      playerId: alex,
      mask: { typeId: "minecraft:dirt" },
      pattern: { state: stone },
    });
    runAll(env);
    expect(env.world.stateAt(overworld, { x: 0, y: 64, z: 0 })).toEqual(stone);
    expect(env.world.stateAt(overworld, { x: 1, y: 64, z: 0 })).not.toEqual(
      stone,
    );
    expect(env.feedback.messages.at(-1)).toEqual({
      message: "editDone",
      count: 1,
    });
  });

  it("skips unreadable cells when copying and replacing", () => {
    const env = setup();
    env.world.put({ x: 0, y: 64, z: 0 }, dirt);
    env.world.put({ x: 1, y: 64, z: 0 }, dirt);
    env.world.unreadableCells.add(cellKey({ x: 1, y: 64, z: 0 }));
    select(env, alex, 2);
    env.copy.execute({ playerId: alex });
    expect(env.repo.get(alex)?.clipboard?.cells.length).toBe(3);
    env.replace.execute({
      playerId: alex,
      mask: { typeId: "minecraft:dirt" },
      pattern: { state: stone },
    });
    runAll(env);
    expect(env.world.writes).toBe(1);
    expect(env.world.stateAt(overworld, { x: 0, y: 64, z: 0 })).toEqual(stone);
  });

  it("refuses a paste as a whole when one cell is protected", () => {
    const env = setup();
    env.world.put({ x: 0, y: 64, z: 0 }, dirt);
    select(env, alex, 2);
    env.copy.execute({ playerId: alex });
    expect(env.feedback.messages.at(-1)?.message).toBe("copied");
    env.world.protectedCells.add(cellKey({ x: 1, y: 64, z: 1 }));
    env.paste.execute({ playerId: alex, skipAir: false });
    expect(env.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
    expect(env.repo.get(alex)?.isEditing).toBe(false);
    expect(env.world.writes).toBe(0);
  });

  it("leaves air cells untouched when pasting with skip air", () => {
    const env = setup();
    env.world.put({ x: 0, y: 64, z: 0 }, dirt);
    select(env, alex, 2);
    env.copy.execute({ playerId: alex });
    env.anchor.feet = { dimensionId: overworld, cell: { x: 10, y: 64, z: 10 } };
    env.world.put({ x: 11, y: 64, z: 10 }, stone);
    env.paste.execute({ playerId: alex, skipAir: true });
    runAll(env);
    expect(env.world.stateAt(overworld, { x: 10, y: 64, z: 10 })).toEqual(dirt);
    expect(env.world.stateAt(overworld, { x: 11, y: 64, z: 10 })).toEqual(
      stone,
    );
  });

  it("drops a job whose session was removed", () => {
    const env = setup();
    const s = env.repo.getOrCreate(alex);
    s.setCorner("pos1", overworld, { x: 0, y: 0, z: 0 });
    s.setCorner("pos2", overworld, { x: 63, y: 3, z: 63 });
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    env.jobs.step();
    const written = env.world.writes;
    env.repo.remove(alex);
    env.jobs.step();
    env.jobs.step();
    expect(env.world.writes).toBe(written);
  });

  it("undoes only what was written when the engine refused some cells", () => {
    const env = setup();
    env.world.refusedCells.add(cellKey({ x: 1, y: 64, z: 1 }));
    select(env, alex, 3);
    env.fill.execute({ playerId: alex, pattern: { state: stone } });
    runAll(env);
    expect(env.feedback.messages.at(-1)).toEqual({
      message: "editDone",
      count: 8,
    });
    env.undo.execute({ playerId: alex });
    runAll(env);
    expect(
      snapshot(env.world, 3).every(
        (s) => s === JSON.stringify(blockStateOf("minecraft:air")),
      ),
    ).toBe(true);
    expect(env.feedback.messages.at(-1)).toEqual({
      message: "undoDone",
      count: 8,
    });
  });
});
