import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, cellsOf } from "../../../src/domain/build/box";
import { recordPaste } from "../../../src/domain/build/flow/paste";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { structureHandle } from "../../../src/domain/build/structure/handle";
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
import { FakeStructureStore } from "./fakes/structureStore";

const playerId = asPlayerId("paste");
const handle = structureHandle("clipboard");
const origin = fc.record({
  x: fc.integer({ min: -50, max: 50 }),
  y: fc.integer({ min: 0, max: 50 }),
  z: fc.integer({ min: -50, max: 50 }),
});
function setup(anchor = { x: 0, y: 1, z: 0 }, blockCount = 8) {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  const world = new FakeWorld();
  const players = new FakeBuildPlayers();
  const feedback = new FakeFeedback();
  const store = new FakeStructureStore();
  store.live.add(handle);
  const box = boxOf(anchor, {
    x: anchor.x + 1,
    y: anchor.y + 1,
    z: anchor.z + 1,
  });
  session.completeCopy(overworld, box, {
    size: { x: 2, y: 2, z: 2 },
    blockCount,
    contents: { kind: "structure", handle },
  });
  const jobs = new EditJobs(repo, world, feedback, { warn: () => {} }, players);
  const start = vi.spyOn(jobs, "start");
  const paste = new PasteAt(repo, world, feedback, jobs, store, players);
  const cmd = {
    playerId,
    dimensionId: overworld,
    target: { anchor, box },
    tick: 100,
  };
  return { repo, session, world, players, feedback, store, start, paste, cmd };
}

it("captures before replacement, records only after place, discards older snapshots and counts the clipboard", () => {
  fc.assert(
    fc.property(origin, fc.nat({ max: 100 }), (anchor, count) => {
      const e = setup(anchor, count);
      const old = structureHandle("older");
      e.store.live.add(old);
      e.session.recordSnapshot({
        dimensionId: overworld,
        box: e.cmd.target.box,
        handle: old,
      });
      for (const c of cellsOf(e.cmd.target.box))
        e.world.put(c, blockStateOf("minecraft:chest"));
      const record = vi.spyOn(e.session, "recordSnapshot");
      const place = vi.spyOn(e.store, "place");
      expect(e.paste.execute(e.cmd)).toBe("pasted");
      expect(e.store.calls.map((c) => c.kind)).toEqual([
        "capture",
        "clearEntities",
        "place",
        "discard",
      ]);
      expect(e.store.calls[0]).toEqual({
        kind: "capture",
        dimensionId: overworld,
        box: e.cmd.target.box,
        ownerId: playerId,
      });
      expect(e.store.calls[2]).toEqual({
        kind: "place",
        handle,
        dimensionId: overworld,
        anchor,
      });
      expect(record.mock.invocationCallOrder[0]).toBeGreaterThan(
        place.mock.invocationCallOrder[0] ?? 0,
      );
      expect(e.session.takeUndo()).toEqual({
        kind: "snapshot",
        snapshot: {
          dimensionId: overworld,
          box: e.cmd.target.box,
          handle: structureHandle("fake_paste_1"),
        },
      });
      expect(e.session.takeUndo()).toBe("nothingToUndo");
      expect(e.feedback.messages).toEqual([{ message: "editDone", count }]);
      expect(e.feedback.undoHints.length).toBe(count > 0 ? 1 : 0);
      expect(e.session.isEditing).toBe(false);
      expect(e.start).not.toHaveBeenCalled();
    }),
  );
});

it("refuses any protected cell before touching structures", () => {
  fc.assert(
    fc.property(origin, fc.integer({ min: 0, max: 7 }), (anchor, index) => {
      const e = setup(anchor);
      const cells = [...cellsOf(e.cmd.target.box)];
      const protectedCell = cells[index];
      if (!protectedCell) throw new Error("Missing generated cell");
      e.world.protectedCells.add(cellKey(protectedCell));
      expect(e.paste.execute(e.cmd)).toBe("refused");
      expect(e.feedback.messages.at(-1)?.message).toBe("pasteBlocked");
      expect(e.store.calls).toEqual([]);
      expect(e.session.hasHistory).toBe(false);
    }),
  );
});

it.each(["idle", "noClipboard", "repeat", "busy"] as const)(
  "does not touch structures for %s",
  (reason) => {
    const e = setup();
    if (reason === "idle") e.session.setFlow({ kind: "idle" });
    if (reason === "noClipboard") e.session.clearClipboard();
    if (reason === "repeat" && e.session.flow.kind === "pasteAim")
      e.session.setFlow(
        recordPaste(e.session.flow, e.cmd.target.anchor, e.cmd.tick),
      );
    if (reason === "busy") e.session.beginEdit();
    const flow = e.session.flow;
    expect(e.paste.execute(e.cmd)).toBe(
      reason === "idle" || reason === "repeat" ? "ignored" : "refused",
    );
    expect(e.store.calls).toEqual([]);
    expect(e.session.flow).toBe(flow);
  },
);

it.each(["tooLarge", "unreadable", "place"] as const)(
  "preserves history and flow on %s failure",
  (failure) => {
    const e = setup();
    const older = {
      dimensionId: overworld,
      box: e.cmd.target.box,
      handle: structureHandle("older"),
    };
    e.session.recordSnapshot(older);
    const flow = e.session.flow;
    if (failure === "place") {
      const place = e.store.place.bind(e.store);
      vi.spyOn(e.store, "place").mockImplementation((h, d, a) => {
        const result = place(h, d, a);
        return h === handle ? false : result;
      });
    } else e.store.captureRefusal = failure;
    expect(e.paste.execute(e.cmd)).toBe("refused");
    expect(e.store.calls.map((c) => c.kind)).toEqual(
      failure === "place"
        ? [
            "capture",
            "clearEntities",
            "place",
            "clearEntities",
            "place",
            "discard",
          ]
        : ["capture"],
    );
    if (failure === "place")
      expect(e.store.calls[4]).toEqual({
        kind: "place",
        handle: structureHandle("fake_paste_1"),
        dimensionId: overworld,
        anchor: e.cmd.target.box.min,
      });
    expect([...e.store.live]).toEqual([handle]);
    expect(e.session.takeUndo()).toEqual({ kind: "snapshot", snapshot: older });
    expect(e.session.takeUndo()).toBe("nothingToUndo");
    expect(e.session.flow).toBe(flow);
    expect(e.feedback.messages.at(-1)?.message).toBe("pasteFailed");
    expect(e.feedback.undoHints).toEqual([]);
  },
);

it("lifts only an occupant buried by a non-open cell inside the pasted box", () => {
  fc.assert(
    fc.property(
      origin,
      fc.constantFrom("feet", "head", "outside", "dimension", "open", "absent"),
      (anchor, situation) => {
        const e = setup(anchor);
        const feet =
          situation === "head"
            ? { ...anchor, y: anchor.y - 1 }
            : situation === "outside"
              ? { ...anchor, x: anchor.x - 3 }
              : anchor;
        if (situation !== "absent")
          e.players.occupants.set(playerId, {
            dimensionId: situation === "dimension" ? nether : overworld,
            feet,
          });
        const place = e.store.place.bind(e.store);
        vi.spyOn(e.store, "place").mockImplementation((h, d, a) => {
          if (situation !== "open")
            e.world.put(
              situation === "outside" ? feet : anchor,
              blockStateOf("minecraft:stone"),
            );
          return place(h, d, a);
        });
        e.paste.execute(e.cmd);
        expect(e.players.moves.length).toBe(
          situation === "feet" || situation === "head" ? 1 : 0,
        );
        if (e.players.moves.length)
          expect(e.players.moves[0]?.cell.y).toBe(anchor.y + 1);
      },
    ),
  );
});

it("allows another paste after the repeat window with just one undo hint", () => {
  const e = setup();
  e.paste.execute(e.cmd);
  expect(e.paste.execute({ ...e.cmd, tick: e.cmd.tick + 1 })).toBe("ignored");
  expect(
    e.paste.execute({
      ...e.cmd,
      tick: e.cmd.tick + BUILD_SPEC.pasteRepeatTicks,
    }),
  ).toBe("pasted");
  expect(e.feedback.undoHints).toEqual([playerId]);
});

it("restores blocks and entities after a partially failed placement", () => {
  const e = setup();
  const before = blockStateOf("minecraft:chest");
  e.world.put(e.cmd.target.anchor, before);
  let entities = ["original frame", "original cow"];
  const savedEntities = [...entities];
  const clear = e.store.clearEntities.bind(e.store);
  vi.spyOn(e.store, "clearEntities").mockImplementation((d, b) => {
    clear(d, b);
    entities = [];
  });
  const place = e.store.place.bind(e.store);
  vi.spyOn(e.store, "place").mockImplementation((h, d, a) => {
    place(h, d, a);
    if (h === handle) {
      e.world.put(a, blockStateOf("minecraft:stone"));
      entities.push("partial pasted cow");
      return false;
    }
    e.world.put(a, before);
    entities.push(...savedEntities);
    return true;
  });
  expect(e.paste.execute(e.cmd)).toBe("refused");
  expect(e.world.stateAt(overworld, e.cmd.target.anchor)).toEqual(before);
  expect(entities).toEqual(savedEntities);
  expect(e.session.hasHistory).toBe(false);
});

it("discards the paste snapshot before removing the session, and tolerates repeated end", () => {
  fc.assert(
    fc.property(origin, (anchor) => {
      const e = setup(anchor);
      expect(e.paste.execute(e.cmd)).toBe("pasted");
      const snapshot = structureHandle("fake_paste_1");
      expect(e.store.live.has(snapshot)).toBe(true);
      const discard = vi.spyOn(e.store, "discard");
      const remove = vi.spyOn(e.repo, "remove");
      const end = new EndBuildSession(e.repo, e.store);
      end.execute(playerId);
      expect(discard).toHaveBeenCalledExactlyOnceWith(snapshot);
      expect(discard.mock.invocationCallOrder[0]).toBeLessThan(
        remove.mock.invocationCallOrder[0] ?? 0,
      );
      expect(e.store.live.has(snapshot)).toBe(false);
      expect(e.session.hasHistory).toBe(false);
      expect(e.repo.get(playerId)).toBeUndefined();
      end.execute(playerId);
      expect(discard).toHaveBeenCalledTimes(1);
    }),
  );
});
