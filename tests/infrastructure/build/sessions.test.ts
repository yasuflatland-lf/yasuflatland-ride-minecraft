import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { CopyBox } from "../../../src/application/build/copyBox";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { EndPasting } from "../../../src/application/build/endPasting";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import { PressDebounces } from "../../../src/domain/build/pressDebounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { registerSessions } from "../../../src/infrastructure/build/bedrock/handlers/sessions";
import {
  FakeFeedback,
  FakeSessions,
  overworld,
} from "../../application/build/fakes";
import { FakeStructureStore } from "./../../application/build/fakes/structureStore";

const engine = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const event = (name: string) => ({
    subscribe: (handler: (event: unknown) => void) =>
      handlers.set(name, handler),
  });
  return { handlers, event };
});
vi.mock("@minecraft/server", () => ({
  world: {
    afterEvents: {
      playerLeave: engine.event("leave"),
      playerDimensionChange: engine.event("dimension"),
      entityDie: engine.event("die"),
    },
  },
}));

// Kept separate so the death/dimension assumption can be reverted (ADR 0203, Decision 5).
it("discards the clipboard and confirmed box on death and dimension change in every flow", () => {
  fc.assert(
    fc.property(fc.string(), fc.integer({ min: -100, max: 100 }), (name, x) => {
      const id = asPlayerId(name);
      const at = { x, y: 10, z: 0 };
      const stone = blockStateOf("minecraft:stone");
      const first = tapBlock({ kind: "idle" }, overworld, at, stone);
      const endpoint = tapAir(first, { ...at, x: x + 2, z: 2 });
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        beginRotateMode(overworld, boxOf(at, at), stone, 1),
        chooseHeighted(endpoint, "copy"),
        { kind: "pasteAim", turn: 0 } as const,
      ]) {
        for (const event of ["dimension", "die"]) {
          const repo = new FakeSessions();
          const structures = new FakeStructureStore();
          const session = repo.getOrCreate(id);
          const debounce = new PressDebounces<PlayerId>(10);
          const pasteDebounce = new PressDebounces<PlayerId>(10);
          const rotateDebounce = new PressDebounces<PlayerId>(7);
          new CopyBox(repo, structures, new FakeFeedback()).execute(
            id,
            overworld,
            boxOf(at, at),
          );
          session.finishEdit(
            {
              dimensionId: overworld,
              changes: [
                {
                  cell: at,
                  before: stone,
                  after: blockStateOf("minecraft:dirt"),
                },
              ],
            },
            "undoable",
          );
          session.setFlow(flow);
          expect(debounce.press(id, 0)).toBe(true);
          expect(pasteDebounce.press(id, 0)).toBe(true);
          expect(rotateDebounce.press(id, 0)).toBe(true);
          registerSessions(
            new EndBuildSession(repo, structures),
            new EndPasting(repo, structures),
            debounce,
            pasteDebounce,
            rotateDebounce,
          );
          engine.handlers.get(event)?.({
            player: { id },
            deadEntity: { id, typeId: "minecraft:player" },
          });
          expect(session.flow).toEqual({ kind: "idle" });
          expect(session.clipboard).toBeUndefined();
          expect(structures.live.size).toBe(0);
          expect(session.confirmedBox).toBeUndefined();
          expect(repo.get(id)).toBe(session);
          expect(session.takeUndo()).toMatchObject({ kind: "cells" });
          expect(rotateDebounce.press(id, 0)).toBe(false);
          expect(debounce.press(id, 0)).toBe(false);
          expect(pasteDebounce.press(id, 0)).toBe(false);
        }
      }
    }),
  );
});

it("ignores non-player deaths and drops the session, history and all debounces on disconnect", () => {
  const repo = new FakeSessions();
  const id = asPlayerId("p");
  const session = repo.getOrCreate(id);
  const debounce = new PressDebounces<PlayerId>(10);
  const pasteDebounce = new PressDebounces<PlayerId>(10);
  const rotateDebounce = new PressDebounces<PlayerId>(7);
  const at = { x: 0, y: 0, z: 0 };
  const structures = new FakeStructureStore();
  new CopyBox(repo, structures, new FakeFeedback()).execute(
    id,
    overworld,
    boxOf(at, at),
  );
  const handle = structures.capture(overworld, boxOf(at, at), id);
  if (handle === "tooLarge" || handle === "unreadable") throw new Error(handle);
  session.recordSnapshot({
    dimensionId: overworld,
    box: boxOf(at, at),
    handle,
  });
  expect(structures.live.size).toBe(2);
  const clipboard = session.clipboard;
  session.setFlow(
    beginRotateMode(
      overworld,
      boxOf(at, at),
      blockStateOf("minecraft:stone"),
      1,
    ),
  );
  registerSessions(
    new EndBuildSession(repo, structures),
    new EndPasting(repo, structures),
    debounce,
    pasteDebounce,
    rotateDebounce,
  );
  engine.handlers.get("die")?.({ deadEntity: { id, typeId: "minecraft:pig" } });
  expect(session.flow.kind).toBe("rotateMode");
  expect(session.clipboard).toBe(clipboard);
  expect(debounce.press(id, 0)).toBe(true);
  expect(pasteDebounce.press(id, 0)).toBe(true);
  expect(rotateDebounce.press(id, 0)).toBe(true);
  engine.handlers.get("leave")?.({ playerId: id });
  expect(repo.get(id)).toBeUndefined();
  expect(session.hasHistory).toBe(false);
  expect(structures.live.size).toBe(0);
  expect(debounce.press(id, 0)).toBe(true);
  expect(pasteDebounce.press(id, 0)).toBe(true);
  expect(rotateDebounce.press(id, 0)).toBe(true);
});
