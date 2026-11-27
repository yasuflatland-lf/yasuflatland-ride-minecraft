import { ScriptEventSource, system, world } from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { MenuChoices } from "../../../src/application/build/menuChoices";
import { PressGaps } from "../../../src/application/build/pressGaps";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { ShowPreview } from "../../../src/application/build/showPreview";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import {
  type AimOverride,
  BedrockAimReader,
} from "../../../src/infrastructure/build/bedrock/bedrockAimReader";
import { BedrockFeedback } from "../../../src/infrastructure/build/bedrock/bedrockFeedback";
import {
  TEST_EDIT_EVENT,
  TEST_RESULT_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { DescribeBuild } from "../../../src/infrastructure/build/testHooks/describeBuild";
import { recordMessages } from "../../../src/infrastructure/build/testHooks/recordMessages";
import { TestAimReader } from "../../../src/infrastructure/build/testHooks/testAim";
import { registerTestEdit } from "../../../src/infrastructure/build/testHooks/testEdit";
import {
  FakeGroundProbe,
  FakeSessions,
  FakeTapTargets,
  FakeWorld,
  fakeSyncTapTarget,
} from "../../application/build/fakes";
import { menuCasesFor } from "../../application/build/fakes/menuChoices";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";

vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  Direction: {},
  MolangVariableMap: class {
    setColorRGB() {}
  },
  InputMode: { Touch: "Touch" },
  system: {
    afterEvents: { scriptEventReceive: { subscribe: vi.fn() } },
    sendScriptEvent: vi.fn(),
    currentTick: 1,
  },
  world: { getAllPlayers: vi.fn(), getEntity: vi.fn() },
}));

function setup() {
  vi.mocked(world.getEntity).mockReset();
  const feedback = new BedrockFeedback();
  return { feedback, messages: recordMessages(feedback) };
}

const player = asPlayerId("player");
const other = asPlayerId("other");
const optionalCount = fc.option(fc.nat(), { nil: undefined });

it("records only the latest message per player", () => {
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
        feedback.showMessage(player, "editDone", 12);
        feedback.showMessage(other, "copied", 7);
        feedback.showMessage(player, message, count, material, skippedCount);
        expect(messages.last(player)).toEqual({ message, count, skippedCount });
        expect(messages.last(other)).toEqual({
          message: "copied",
          count: 7,
          skippedCount: undefined,
        });
        feedback.showMessage(player, "selectionCleared");
        expect(messages.last(player)).toEqual({
          message: "selectionCleared",
          count: undefined,
          skippedCount: undefined,
        });
      },
    ),
  );
});

it("counts undo hints per player and forgets only that player's records", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), (count) => {
      const { feedback, messages } = setup();
      expect(messages.hints(player)).toBe(0);
      feedback.showMessage(player, "undoDonePartial", 3, undefined, 2);
      feedback.showMessage(other, "undoDone", 4);
      feedback.showUndoHint(other);
      for (let i = 0; i < count; i++) feedback.showUndoHint(player);
      expect(messages.hints(player)).toBe(count);
      expect(messages.hints(other)).toBe(1);
      messages.forget(player);
      expect(messages.last(player)).toBeUndefined();
      expect(messages.hints(player)).toBe(0);
      expect(messages.last(other)?.message).toBe("undoDone");
      expect(messages.hints(other)).toBe(1);
      feedback.showUndoHint(player);
      expect(messages.hints(player)).toBe(1);
    }),
  );
});

function snapshotHook() {
  const structures = new FakeStructureStore();
  const repo = new FakeSessions(structures);
  const { feedback, messages } = setup();
  vi.mocked(system.sendScriptEvent).mockClear();
  const builder = {
    id: "player",
    name: "Alex",
    typeId: "minecraft:player",
    isValid: true,
    dimension: { id: "minecraft:overworld" },
    inputInfo: { lastInputModeUsed: "KeyboardAndMouse" },
    getHeadLocation: () => ({ x: 0, y: 5, z: 0 }),
    getViewDirection: () => ({ x: 1, y: 0, z: 0 }),
    getBlockFromViewDirection: () => undefined,
    onScreenDisplay: { setActionBar: vi.fn() },
    spawnParticle: vi.fn(),
  } as unknown as ReturnType<typeof world.getAllPlayers>[number];
  vi.mocked(world.getAllPlayers).mockReturnValue([builder]);
  vi.mocked(world.getEntity).mockReturnValue(builder);
  const overrides = new Map<PlayerId, AimOverride>();
  const aim = new BedrockAimReader(overrides);
  const preview = new ShowPreview(
    repo,
    feedback,
    aim,
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
    fakeSyncTapTarget(),
    new FakeWorld(),
  );
  const undo = vi.fn(() => ({}));
  const undoItem = vi.fn(() => "stepped" as const);
  type Args = Parameters<typeof registerTestEdit>;
  registerTestEdit(
    new MenuChoices(repo, menuCasesFor(repo), {
      blocks: new FakeWorld(),
      feedback,
      refresh: () => {},
    }),
    { execute: undo } as unknown as Args[1],
    { execute: undoItem } as unknown as Args[2],
    new DescribeBuild(repo),
    messages,
    repo,
    new EndBuildSession(repo, new FakeTapTargets(), new PressGaps()),
    structures,
    { aim: new TestAimReader(overrides), preview },
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
  return {
    repo,
    structures,
    send,
    feedback,
    messages,
    aim,
    undo,
    undoItem,
  };
}

it("applies an offered paste menu command and reports it in the reply", () => {
  const e = snapshotHook();
  const session = e.repo.getOrCreate(player);
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  e.send("menu paste endPaste");
  expect(session.flow).toEqual({ kind: "idle" });
  expect(
    JSON.parse(
      vi.mocked(system.sendScriptEvent).mock.calls.at(-1)?.[1] ?? "{}",
    ),
  ).toMatchObject({ offered: true });
});

it("replies to a dismissed shape menu command with no entry", () => {
  const e = snapshotHook();
  e.send("menu shape");
  expect(
    JSON.parse(
      vi.mocked(system.sendScriptEvent).mock.calls.at(-1)?.[1] ?? "{}",
    ),
  ).toMatchObject({ offered: false });
});

it("routes undoitem to the item use case and undo to edit history", () => {
  const e = snapshotHook();
  e.send("undoitem");
  expect(e.undoItem).toHaveBeenCalledExactlyOnceWith({ playerId: player });
  expect(e.undo).not.toHaveBeenCalled();
  e.send("undo");
  expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: player });
  expect(e.undoItem).toHaveBeenCalledTimes(1);
});

it("captures normalized snapshot corners in the player's dimension and discards only evicted handles", () => {
  const e = snapshotHook();
  e.send("snapshot 3 4 5 1 2 3");
  const dimensionId = asDimensionId("minecraft:overworld");
  const box = { min: { x: 1, y: 2, z: 3 }, max: { x: 3, y: 4, z: 5 } };
  expect(e.structures.calls).toEqual([
    { kind: "capture", dimensionId, box, ownerId: player, mode: "exact" },
  ]);
  const first = [...e.structures.live][0];
  for (let i = 1; i < BUILD_SPEC.undoDepth; i++) {
    e.send("snapshot 1 2 3 3 4 5");
    expect(
      e.structures.calls.filter((call) => call.kind === "discard"),
    ).toEqual([]);
  }
  e.send("snapshot 1 2 3 3 4 5");
  expect(e.structures.calls.at(-1)).toEqual({ kind: "discard", handle: first });
  expect(e.structures.live.size).toBe(BUILD_SPEC.undoDepth);
  for (const handle of [...e.structures.live].reverse())
    expect(e.repo.getOrCreate(player).takeUndo()).toEqual({
      kind: "snapshot",
      snapshot: { dimensionId, box, handle },
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

it("records the last mode independently per player and clears it on forget", () => {
  fc.assert(
    fc.property(fc.constantFrom(0, 90, 180, 270), (degrees) => {
      const { feedback, messages } = setup();
      const mode = {
        kind: "pasteReady" as const,
        size: { x: 2, y: 3, z: 4 },
        blockCount: 24,
        degrees,
      };
      expect(messages.lastMode(player)).toBeUndefined();
      feedback.showMode(other, { ...mode, degrees: 90 });
      feedback.showMode(player, mode);
      expect(messages.lastMode(player)).toEqual(mode);
      expect(messages.lastMode(other)).toEqual({ ...mode, degrees: 90 });
      messages.forget(player);
      expect(messages.lastMode(player)).toBeUndefined();
      expect(messages.lastMode(other)).toEqual({ ...mode, degrees: 90 });
    }),
  );
});

it("returns the last shown paste-ready degrees in a state reply without clearing them", () => {
  const e = snapshotHook();
  e.feedback.showMode(player, {
    kind: "pasteReady",
    size: { x: 1, y: 2, z: 3 },
    blockCount: 6,
    degrees: 270,
  });
  e.send("state");
  expect(
    JSON.parse(
      vi.mocked(system.sendScriptEvent).mock.calls.at(-1)?.[1] ?? "{}",
    ),
  ).toMatchObject({ pasteReadyDegrees: 270 });
  expect(e.messages.lastMode(player)?.degrees).toBe(270);
});

it("keeps the HUD turn until a block tap despite changes in the facing override", () => {
  const e = snapshotHook();
  e.send("structure 0 0 0 1 1 1 east");
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    e.repo.getOrCreate(player).tickMode({ holding: true });
  for (const facing of ["east", "south", "west", "north"]) {
    e.send(`aim ${facing}`);
    expect(
      JSON.parse(
        vi.mocked(system.sendScriptEvent).mock.calls.at(-1)?.[1] ?? "{}",
      ),
    ).toMatchObject({ pasteReadyDegrees: 0 });
  }
  vi.mocked(system.sendScriptEvent).mockClear();
  e.send("aim invalid");
  expect(system.sendScriptEvent).not.toHaveBeenCalled();
  e.send("aim clear");
  expect(e.messages.lastMode(player)?.degrees).toBe(0);
  expect(e.aim.aim(player)?.ray.direction).toEqual({ x: 1, y: 0, z: 0 });
});
