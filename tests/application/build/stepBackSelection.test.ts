import { expect, it } from "vitest";
import { StepBackSelection } from "../../../src/application/build/stepBackSelection";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/heightFlow";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, nether } from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("alex");
const start = { x: 2, y: 60, z: 3 };
const point = tapBlock(
  { kind: "idle" },
  nether,
  start,
  blockStateOf("minecraft:stone"),
);

function setup() {
  const repo = new FakeSessions();
  const feedback = new FakeFeedback();
  return { repo, feedback, stepBack: new StepBackSelection(repo, feedback) };
}

it.each([
  ["baseHeight", { ...start, x: 5, z: 6 }],
  ["selected", { ...start, x: 5 }],
] as const)("clears the end of a fresh %s", (kind, end) => {
  const { repo, feedback, stepBack } = setup();
  const session = repo.getOrCreate(playerId);
  const flow = tapAir(point, end);
  expect(flow.kind).toBe(kind);
  session.setFlow(flow);
  expect(stepBack.execute({ playerId })).toBe("stepped");
  expect(session.flow).toBe(point);
  expect(feedback.messages).toEqual([
    { message: "endCleared", count: undefined },
  ]);
});

it("clears the start during a running edit and keeps all history entries", () => {
  const { repo, feedback, stepBack } = setup();
  const session = repo.getOrCreate(playerId);
  const structures = new FakeStructureStore();
  const box = boxOf(start, start);
  const capture = () => structures.capture(nether, box, playerId, "exact");
  const first = capture();
  const last = capture();
  if (
    first === "tooLarge" ||
    first === "unreadable" ||
    last === "tooLarge" ||
    last === "unreadable"
  )
    throw new Error("Expected snapshots");
  for (const handle of [first, last])
    session.recordSnapshot({ dimensionId: nether, box, handle });
  session.setFlow(point);
  session.beginEdit();
  expect(stepBack.execute({ playerId })).toBe("stepped");
  expect(session.flow).toEqual({ kind: "idle" });
  expect(session.isEditing).toBe(true);
  expect(feedback.messages.at(-1)?.message).toBe("startCleared");
  expect(session.clearHistory()).toEqual([first, last]);
});

it("has no selection step for a missing or idle session", () => {
  const { repo, feedback, stepBack } = setup();
  expect(stepBack.execute({ playerId })).toBe("none");
  expect(repo.get(playerId)).toBeUndefined();
  const session = repo.getOrCreate(playerId);
  const idle = session.flow;
  expect(stepBack.execute({ playerId })).toBe("none");
  expect(session.flow).toBe(idle);
  expect(feedback.messages).toEqual([]);
});

it.each([
  { ...start, x: 5, z: 6 },
  { ...start, x: 5 },
])(
  "clears a fresh endpoint while an edit runs without consuming history: %j",
  (end) => {
    const { repo, feedback, stepBack } = setup();
    const session = repo.getOrCreate(playerId);
    const record = {
      dimensionId: nether,
      changes: [
        {
          cell: start,
          before: blockStateOf("minecraft:dirt"),
          after: blockStateOf("minecraft:stone"),
        },
      ],
    };
    session.finishEdit(record, "undoable");
    session.beginEdit();
    session.setFlow(tapAir(point, end));
    expect(stepBack.execute({ playerId })).toBe("stepped");
    expect(session.flow).toBe(point);
    expect(session.isEditing).toBe(true);
    expect(feedback.messages.at(-1)?.message).toBe("endCleared");
    session.finishEdit(record, "undo");
    expect(session.takeUndo()).toEqual({ kind: "cells", record });
    expect(session.takeUndo()).toBe("nothingToUndo");
  },
);
