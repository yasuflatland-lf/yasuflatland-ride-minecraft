import { ScriptEventSource, system, world } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { DescribeBuild } from "../../../src/application/build/describeBuild";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import {
  recordMessages,
  registerTestEdit,
} from "../../../src/infrastructure/build/bedrock/handlers/testEdit";
import {
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { FakeSessions } from "../../application/build/fakes";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";

vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
    sendScriptEvent: vi.fn(),
    currentTick: 1,
  },
  world: { getAllPlayers: vi.fn() },
}));

function setup() {
  const feedback = {
    showMessage: vi.fn<BuildFeedback["showMessage"]>(),
    showUndoHint: vi.fn<BuildFeedback["showUndoHint"]>(),
    showSize: vi.fn<BuildFeedback["showSize"]>(),
    showPasteHint: vi.fn<BuildFeedback["showPasteHint"]>(),
    drawPreview: vi.fn<BuildFeedback["drawPreview"]>(),
  };
  return { feedback, messages: recordMessages(feedback) };
}

const player = asPlayerId("player");
const other = asPlayerId("other");
const optionalCount = fc.option(fc.nat(), { nil: undefined });

it("forwards every message argument and records only the latest message per player", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("undoDonePartial", "undoDone", "building"),
      optionalCount,
      optionalCount,
      (message, count, skippedCount) => {
        const { feedback, messages } = setup();
        const material = blockStateOf("minecraft:oak_log", {
          pillar_axis: "x",
        });
        expect(messages.last(player)).toBeUndefined();
        messages.feedback.showMessage(player, "editDone", 12);
        messages.feedback.showMessage(other, "copied", 7);
        messages.feedback.showMessage(
          player,
          message,
          count,
          material,
          skippedCount,
        );
        expect(feedback.showMessage).toHaveBeenLastCalledWith(
          player,
          message,
          count,
          material,
          skippedCount,
        );
        expect(messages.last(player)).toEqual({ message, count, skippedCount });
        expect(messages.last(other)).toEqual({
          message: "copied",
          count: 7,
          skippedCount: undefined,
        });
        messages.feedback.showMessage(player, "selectionCleared");
        expect(messages.last(player)).toEqual({
          message: "selectionCleared",
          count: undefined,
          skippedCount: undefined,
        });
      },
    ),
  );
});

it("forwards undo hints, counts them per player, and forgets only that player's records", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
      const { feedback, messages } = setup();
      expect(messages.hints(player)).toBe(0);
      messages.feedback.showMessage(player, "undoDonePartial", 3, undefined, 2);
      messages.feedback.showMessage(other, "undoDone", 4);
      messages.feedback.showUndoHint(other);
      for (let i = 0; i < count; i++) messages.feedback.showUndoHint(player);
      expect(feedback.showUndoHint.mock.calls).toEqual([
        [other],
        ...Array.from({ length: count }, () => [player]),
      ]);
      expect(messages.hints(player)).toBe(count);
      expect(messages.hints(other)).toBe(1);
      messages.forget(player);
      expect(messages.last(player)).toBeUndefined();
      expect(messages.hints(player)).toBe(0);
      expect(messages.last(other)?.message).toBe("undoDone");
      expect(messages.hints(other)).toBe(1);
      messages.feedback.showUndoHint(player);
      expect(messages.hints(player)).toBe(1);
    }),
  );
});

function snapshotHook() {
  const repo = new FakeSessions();
  const structures = new FakeStructureStore();
  const { messages } = setup();
  vi.mocked(system.sendScriptEvent).mockClear();
  vi.mocked(world.getAllPlayers).mockReturnValue([
    {
      id: "player",
      name: "Alex",
      isValid: true,
      dimension: { id: "minecraft:overworld" },
    } as ReturnType<typeof world.getAllPlayers>[number],
  ]);
  type Args = Parameters<typeof registerTestEdit>;
  registerTestEdit(
    {} as Args[0],
    {} as Args[1],
    {} as Args[2],
    {} as Args[3],
    {} as Args[4],
    new DescribeBuild(repo),
    messages,
    repo,
    new EndBuildSession(repo, structures),
    structures,
  );
  const callback = vi
    .mocked(system.afterEvents.scriptEventReceive.subscribe)
    .mock.calls.at(-1)?.[0];
  if (!callback) throw new Error("Missing test-edit subscription");
  const send = (command: string) =>
    callback({
      sourceType: ScriptEventSource.Server,
      id: TEST_EDIT_EVENT,
      message: `player ${command}`,
    } as Parameters<typeof callback>[0]);
  return { repo, structures, send };
}

it("captures normalized snapshot corners in the player's dimension and discards replaced handles", () => {
  const e = snapshotHook();
  e.send("snapshot 3 4 5 1 2 3");
  const dimensionId = asDimensionId("minecraft:overworld");
  const box = { min: { x: 1, y: 2, z: 3 }, max: { x: 3, y: 4, z: 5 } };
  expect(e.structures.calls).toEqual([
    { kind: "capture", dimensionId, box, ownerId: player },
  ]);
  const first = [...e.structures.live][0];
  e.send("snapshot 1 2 3 3 4 5");
  expect(e.structures.calls.at(-1)).toEqual({ kind: "discard", handle: first });
  expect(e.structures.live.size).toBe(1);
  expect(e.repo.getOrCreate(player).takeUndo()).toEqual({
    kind: "snapshot",
    snapshot: { dimensionId, box, handle: [...e.structures.live][0] },
  });
  expect(e.repo.getOrCreate(player).takeUndo()).toBe("nothingToUndo");
  expect(system.sendScriptEvent).toHaveBeenCalledWith(
    TEST_RESULT_EVENT,
    expect.stringContaining('"player":"Alex"'),
  );
});

it.each(["tooLarge", "unreadable"] as const)(
  "reports %s capture refusal and retains history",
  (reason) => {
    const e = snapshotHook();
    e.send("snapshot 1 2 3 3 4 5");
    const original = [...e.structures.live][0];
    e.structures.captureRefusal = reason;
    e.send("snapshot 1 2 3 3 4 5");
    expect(system.sendScriptEvent).toHaveBeenLastCalledWith(
      TEST_RESULT_EVENT,
      JSON.stringify({
        player: "Alex",
        error: `Snapshot capture refused: ${reason}`,
      }),
    );
    if (!original) throw new Error("Missing original handle");
    expect(e.structures.live.has(original)).toBe(true);
    expect(e.structures.calls.map((call) => call.kind)).toEqual([
      "capture",
      "capture",
    ]);
    expect(e.repo.getOrCreate(player).hasHistory).toBe(true);
  },
);

it.each([
  "snapshot 1 2 3 4 5",
  "snapshot 1 2 3 4 5 6.5",
  "snapshot 1 2 3 4 5 invalid",
])("ignores malformed command %s", (command) => {
  const e = snapshotHook();
  e.send(command);
  expect(e.structures.calls).toEqual([]);
  expect(e.repo.get(player)).toBeUndefined();
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
});
