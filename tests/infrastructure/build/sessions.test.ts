import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { CopyBox } from "../../../src/application/build/copyBox";
import { EndBuildSession } from "../../../src/application/build/endBuildSession";
import { EndPasting } from "../../../src/application/build/endPasting";
import { AIR, blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/heightFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { Debounces } from "../../../src/domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { ticks } from "../../../src/domain/shared/ticks";
import { registerSessions } from "../../../src/infrastructure/build/bedrock/handlers/sessions";
import {
  FakeFeedback,
  FakeSessions,
  FakeTapTargets,
  overworld,
} from "../../application/build/fakes";
import { FakeStructureStore } from "./../../application/build/fakes/structureStore";
import { confirmEndpointHeight } from "../../support/buildSelection";

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
      const endpoint = confirmEndpointHeight(
        tapAir(first, { ...at, x: x + 2, z: 2 }),
      );
      for (const flow of [
        { kind: "idle" } as const,
        first,
        endpoint,
        chooseHeighted(endpoint, "hip"),
        { kind: "pasteAim", manualTurn: 0 } as const,
      ]) {
        for (const event of ["dimension", "die"]) {
          const structures = new FakeStructureStore();
          const repo = new FakeSessions(structures);
          const session = repo.getOrCreate(id);
          const debounce = new Debounces<PlayerId>(ticks(10));
          const pasteDebounce = new Debounces<PlayerId>(ticks(10));
          const rotateDebounce = new Debounces<PlayerId>(ticks(7));
          const undoDebounce = new Debounces<PlayerId>(ticks(10));
          new CopyBox(repo, structures, new FakeFeedback()).execute({
            playerId: id,
            selection: selectionOf(overworld, boxOf(at, at), AIR),
            facing: "east",
          });
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
          expect(undoDebounce.press(id, 0)).toBe(true);
          registerSessions(
            new EndBuildSession(repo, new FakeTapTargets()),
            new EndPasting(repo),
            debounce,
            pasteDebounce,
            rotateDebounce,
            undoDebounce,
            vi.fn(),
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
          expect(undoDebounce.press(id, 0)).toBe(false);
          expect(debounce.press(id, 0)).toBe(false);
          expect(pasteDebounce.press(id, 0)).toBe(false);
        }
      }
    }),
  );
});

it("ignores non-player deaths and drops the session, history and all debounces on disconnect", () => {
  const structures = new FakeStructureStore();
  const repo = new FakeSessions(structures);
  const id = asPlayerId("p");
  const session = repo.getOrCreate(id);
  const debounce = new Debounces<PlayerId>(ticks(10));
  const pasteDebounce = new Debounces<PlayerId>(ticks(10));
  const rotateDebounce = new Debounces<PlayerId>(ticks(7));
  const undoDebounce = new Debounces<PlayerId>(ticks(10));
  const at = { x: 0, y: 0, z: 0 };
  new CopyBox(repo, structures, new FakeFeedback()).execute({
    playerId: id,
    selection: selectionOf(overworld, boxOf(at, at), AIR),
    facing: "east",
  });
  const handle = structures.capture(overworld, boxOf(at, at), id, "exact");
  if (handle === "tooLarge" || handle === "unreadable") throw new Error(handle);
  session.recordSnapshot({
    dimensionId: overworld,
    box: boxOf(at, at),
    handle,
  });
  expect(structures.live.size).toBe(2);
  const clipboard = session.clipboard;
  session.setFlow(
    confirmEndpointHeight(
      tapAir(tapBlock({ kind: "idle" }, overworld, at, AIR), at),
    ),
  );
  const targets = new FakeTapTargets();
  targets.show(id, { dimensionId: overworld, cell: at });
  const onPlayerLeave = vi.fn();
  registerSessions(
    new EndBuildSession(repo, targets),
    new EndPasting(repo),
    debounce,
    pasteDebounce,
    rotateDebounce,
    undoDebounce,
    onPlayerLeave,
  );
  engine.handlers.get("die")?.({ deadEntity: { id, typeId: "minecraft:pig" } });
  expect(session.flow.kind).toBe("selected");
  expect(session.clipboard).toBe(clipboard);
  expect(debounce.press(id, 0)).toBe(true);
  expect(pasteDebounce.press(id, 0)).toBe(true);
  expect(rotateDebounce.press(id, 0)).toBe(true);
  expect(undoDebounce.press(id, 0)).toBe(true);
  engine.handlers.get("leave")?.({ playerId: id });
  expect(repo.get(id)).toBeUndefined();
  expect(targets.placements.has(id)).toBe(false);
  expect(onPlayerLeave).toHaveBeenCalledExactlyOnceWith(id);
  expect(session.hasHistory).toBe(false);
  expect(structures.live.size).toBe(0);
  expect(debounce.press(id, 0)).toBe(true);
  expect(pasteDebounce.press(id, 0)).toBe(true);
  expect(rotateDebounce.press(id, 0)).toBe(true);
  expect(undoDebounce.press(id, 0)).toBe(true);
});
