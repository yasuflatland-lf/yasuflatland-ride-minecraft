import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EndPasting } from "../../../src/application/build/endPasting";
import { LeaveBuild } from "../../../src/application/build/leaveBuild";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { UpdateBuildModes } from "../../../src/application/build/updateBuildModes";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { pasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { beginPasteAim } from "../../../src/domain/build/flow/paste";
import { turnBetween } from "../../../src/domain/build/rotation/facing";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { asPlayerId } from "../../../src/domain/shared/ids";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { confirmEndpointHeight } from "../../support/buildSelection";
import { undoRecord } from "../../support/undoRecord";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeSessions,
  FakeTapTargets,
  FakeWorld,
  overworld,
} from "./fakes";
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const coordinate = fc.integer({ min: -100, max: 100 });
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
function setup() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const feedback = new FakeFeedback();
  const structures = new FakeStructureStore(world);
  const at = { x: 0, y: 0, z: 0 };
  holdClipboard(
    session,
    structureClipboard(boxOf(at, at), () => stone, structures),
  );
  session.setFlow(beginPasteAim());
  const paste = new PasteAt(
    repo,
    world,
    feedback,
    structures,
    new FakeBuildPlayers(),
  );
  const target = (block: { x: number; y: number; z: number }) => {
    if (!session.clipboard) throw new Error("Expected clipboard");
    return pasteTarget(
      session.clipboard,
      block,
      "up",
      turnBetween(session.clipboard.facing, "east"),
      "east",
    );
  };
  return { repo, session, world, feedback, paste, target, structures };
}

it("leaves any flow after the exact grace delay and does not re-trigger", () => {
  fc.assert(
    fc.property(cell, fc.nat({ max: 30 }), (at, extraTicks) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = confirmEndpointHeight(
        tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 }),
      );
      const height = chooseHeighted(endpoint, "gable");
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        height,
        beginPasteAim(),
      ]) {
        const e = setup();
        const leave = new LeaveBuild(
          e.repo,
          e.structures,
          new FakeTapTargets(),
        );
        const execute = vi.spyOn(leave, "execute");
        const modes = new UpdateBuildModes(e.repo, leave);
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          modes.execute([{ playerId, held: "wand" }]);
        e.session.confirmBox(selectionOf(overworld, boxOf(at, at), stone));
        e.session.setFlow(flow);
        const clipboard = e.session.clipboard;
        const box = e.session.confirmedBox;
        // A one-tick item flicker must keep the copy (ADR 0203, Decision 5).
        modes.execute([{ playerId, held: "none" }]);
        modes.execute([{ playerId, held: "wand" }]);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(box);
        expect(e.session.flow).toBe(flow);
        for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
          modes.execute([{ playerId, held: "none" }]);
        expect(e.session.flow).toBe(flow);
        expect(e.session.clipboard).toBe(clipboard);
        expect(e.session.confirmedBox).toBe(box);
        expect(execute).not.toHaveBeenCalled();
        modes.execute([{ playerId, held: "none" }]);
        expect(e.session.flow).toEqual({ kind: "idle" });
        expect(e.session.clipboard).toBeUndefined();
        expect(e.session.confirmedBox).toBeUndefined();
        expect(e.session.mode).toEqual({ active: false, streak: 0 });
        const idle = e.session.flow;
        for (let i = 0; i < extraTicks + BUILD_SPEC.modeLeaveTicks; i++)
          modes.execute([{ playerId, held: "none" }]);
        expect(execute).toHaveBeenCalledExactlyOnceWith(playerId);
        expect(e.session.flow).toBe(idle);
        expect(e.session.mode).toEqual({ active: false, streak: 0 });
      }
    }),
  );
});

it("LeaveBuild twice has the same effect as once in every flow", () => {
  fc.assert(
    fc.property(cell, (at) => {
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = confirmEndpointHeight(
        tapAir(first, { ...at, x: at.x + 2, z: at.z + 2 }),
      );
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "hip"),
        beginPasteAim(),
      ]) {
        const e = setup();
        e.session.confirmBox(selectionOf(overworld, boxOf(at, at), stone));
        e.session.setFlow(flow);
        const leave = new LeaveBuild(
          e.repo,
          e.structures,
          new FakeTapTargets(),
        );
        const end = vi.spyOn(e.session, "endPasting");
        leave.execute(playerId);
        const idle = e.session.flow;
        leave.execute(playerId);
        expect(e.session.flow).toBe(idle);
        expect(e.session.clipboard).toBeUndefined();
        expect(e.session.confirmedBox).toBeUndefined();
        expect(end).toHaveBeenCalledTimes(1);
      }
    }),
  );
});

it("EndPasting without a session does not create one", () => {
  fc.assert(
    fc.property(fc.string(), (id) => {
      const repo = new FakeSessions();
      const create = vi.spyOn(repo, "getOrCreate");
      const remove = vi.spyOn(repo, "remove");
      new EndPasting(repo, new FakeStructureStore()).execute(asPlayerId(id));
      expect(repo.get(asPlayerId(id))).toBeUndefined();
      expect(create).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    }),
  );
});

it("EndPasting preserves the completed snapshot and older cell history", () => {
  fc.assert(
    fc.property(cell, (block) => {
      const e = setup();
      const older = {
        dimensionId: overworld,
        changes: [{ cell: block, before: stone, after: AIR }],
      };
      e.session.finishEdit(older, "undoable");
      const target = e.target(block);
      e.paste.execute({ playerId, dimensionId: overworld, target });
      expect(e.session.isEditing).toBe(false);
      new EndPasting(e.repo, e.structures).execute(playerId);
      expect(e.session.flow.kind).toBe("idle");
      expect(e.session.clipboard).toBeUndefined();
      expect(e.session.isEditing).toBe(false);
      expect(e.world.writes).toBe(1);
      expect(e.session.takeUndo()).toMatchObject({
        kind: "snapshot",
        snapshot: { dimensionId: overworld, box: target.box },
      });
      expect(undoRecord(e.session.takeUndo())).toBe(older);
      expect(undoRecord(e.session.takeUndo())).toBe("nothingToUndo");
      const start = vi.spyOn(e.structures, "place");
      e.paste.execute({
        playerId,
        dimensionId: overworld,
        target,
      });
      expect(start).not.toHaveBeenCalled();
      expect(e.world.writes).toBe(1);
    }),
  );
});

it("keeps build mode and the clipboard according to held items and paste aiming", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          held: fc.constantFrom(
            "wand" as const,
            "pasteControl" as const,
            "undo" as const,
            "none" as const,
          ),
          aiming: fc.boolean(),
        }),
        { maxLength: 100 },
      ),
      (steps) => {
        const e = setup();
        const modes = new UpdateBuildModes(
          e.repo,
          new LeaveBuild(e.repo, e.structures, new FakeTapTargets()),
        );
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          modes.execute([{ playerId, held: "wand" }]);
        const clipboard = e.session.clipboard;
        let releases = 0;
        for (const { held, aiming } of steps) {
          e.session.setFlow(aiming ? beginPasteAim() : { kind: "idle" });
          releases =
            held === "wand" ||
            held === "undo" ||
            (held === "pasteControl" && aiming)
              ? 0
              : releases + 1;
          modes.execute([{ playerId, held }]);
          if (releases >= BUILD_SPEC.modeLeaveTicks) {
            expect(e.session.isInBuildMode).toBe(false);
            expect(e.session.clipboard).toBeUndefined();
            break;
          }
          expect(e.session.isInBuildMode).toBe(true);
          expect(e.session.clipboard).toBe(clipboard);
        }
      },
    ),
  );
});

it("does not create a session or enter build mode with paste control or undo alone", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.constantFrom(
          "pasteControl" as const,
          "undo" as const,
          "none" as const,
        ),
        {
          minLength: 1,
          maxLength: 100,
        },
      ),
      (items) => {
        const repo = new FakeSessions();
        const modes = new UpdateBuildModes(
          repo,
          new LeaveBuild(repo, new FakeStructureStore(), new FakeTapTargets()),
        );
        for (const held of items) modes.execute([{ playerId, held }]);
        expect(repo.get(playerId)).toBeUndefined();
        expect(modes.isInBuildMode(playerId)).toBe(false);
      },
    ),
  );
});

it("preserves aiming through held controls and leaves after consecutive empty ticks", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.constantFrom(
          "wand" as const,
          "pasteControl" as const,
          "undo" as const,
        ),
        {
          maxLength: 100,
        },
      ),
      fc.nat({ max: 20 }),
      (items, extra) => {
        const e = setup();
        const modes = new UpdateBuildModes(
          e.repo,
          new LeaveBuild(e.repo, e.structures, new FakeTapTargets()),
        );
        for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
          modes.execute([{ playerId, held: "wand" }]);
        const clipboard = e.session.clipboard;
        for (const held of items) {
          modes.execute([{ playerId, held }]);
          expect(e.session.isInBuildMode).toBe(true);
          expect(e.session.clipboard).toBe(clipboard);
        }
        for (let i = 0; i < BUILD_SPEC.modeLeaveTicks + extra; i++) {
          modes.execute([{ playerId, held: "none" }]);
          expect(e.session.isInBuildMode).toBe(
            i < BUILD_SPEC.modeLeaveTicks - 1,
          );
          expect(e.session.clipboard).toBe(
            i < BUILD_SPEC.modeLeaveTicks - 1 ? clipboard : undefined,
          );
        }
      },
    ),
  );
});

it("leaves and discards the clipboard when paste control is held outside aiming", () => {
  const e = setup();
  const modes = new UpdateBuildModes(
    e.repo,
    new LeaveBuild(e.repo, e.structures, new FakeTapTargets()),
  );
  for (let i = 0; i < BUILD_SPEC.modeEnterTicks; i++)
    modes.execute([{ playerId, held: "wand" }]);
  e.session.setFlow({ kind: "idle" });
  for (let i = 0; i < BUILD_SPEC.modeLeaveTicks - 1; i++)
    modes.execute([{ playerId, held: "pasteControl" }]);
  expect(e.session.isInBuildMode).toBe(true);
  expect(e.session.clipboard).toBeDefined();
  modes.execute([{ playerId, held: "pasteControl" }]);
  expect(e.session.isInBuildMode).toBe(false);
  expect(e.session.clipboard).toBeUndefined();
});

it("undo does not enter build mode in an existing inactive session", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 1, max: 100 }),
      (aiming, count) => {
        const e = setup();
        e.session.setFlow(aiming ? beginPasteAim() : { kind: "idle" });
        const modes = new UpdateBuildModes(
          e.repo,
          new LeaveBuild(e.repo, e.structures, new FakeTapTargets()),
        );
        for (let i = 0; i < count; i++)
          modes.execute([{ playerId, held: "undo" }]);
        expect(e.session.isInBuildMode).toBe(false);
      },
    ),
  );
});
