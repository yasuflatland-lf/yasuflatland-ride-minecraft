import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { EndPasting } from "../../../src/application/build/endPasting";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import {
  chooseHeighted,
  tapAir,
  tapBlock,
} from "../../../src/domain/build/flow/flow";
import { PressDebounces } from "../../../src/domain/build/pressDebounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { registerSessions } from "../../../src/infrastructure/build/bedrock/handlers/sessions";
import { FakeSessions, overworld } from "../../application/build/fakes";

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
    fc.property(
      fc.string(),
      fc.integer({ min: -100, max: 100 }),
      fc.boolean(),
      (name, x, skipAir) => {
        const id = asPlayerId(name);
        const at = { x, y: 10, z: 0 };
        const stone = blockStateOf("minecraft:stone");
        const first = tapBlock({ kind: "idle" }, overworld, at, stone);
        const endpoint = tapAir(first, { ...at, x: x + 2, z: 2 });
        for (const flow of [
          { kind: "idle" } as const,
          first,
          endpoint,
          chooseHeighted(endpoint, "copy"),
          { kind: "pasteAim", skipAir } as const,
        ]) {
          for (const event of ["dimension", "die"]) {
            const repo = new FakeSessions();
            const session = repo.getOrCreate(id);
            const debounce = new PressDebounces<PlayerId>(10);
            session.completeCopy(
              overworld,
              boxOf(at, at),
              clipboardOf(boxOf(at, at), () => stone),
            );
            session.setFlow(flow);
            expect(debounce.press(id, 0)).toBe(true);
            registerSessions(repo, new EndPasting(repo), debounce);
            engine.handlers.get(event)?.({
              player: { id },
              deadEntity: { id, typeId: "minecraft:player" },
            });
            expect(session.flow).toEqual({ kind: "idle" });
            expect(session.clipboard).toBeUndefined();
            expect(session.confirmedBox).toBeUndefined();
            expect(repo.get(id)).toBe(session);
            expect(debounce.press(id, 0)).toBe(false);
          }
        }
      },
    ),
  );
});

it("ignores non-player deaths and drops both session and debounce on disconnect", () => {
  const repo = new FakeSessions();
  const id = asPlayerId("p");
  const session = repo.getOrCreate(id);
  const debounce = new PressDebounces<PlayerId>(10);
  const at = { x: 0, y: 0, z: 0 };
  const clipboard = clipboardOf(boxOf(at, at), () =>
    blockStateOf("minecraft:stone"),
  );
  session.setClipboard(clipboard);
  session.setFlow({ kind: "pasteAim", skipAir: false });
  registerSessions(repo, new EndPasting(repo), debounce);
  engine.handlers.get("die")?.({ deadEntity: { id, typeId: "minecraft:pig" } });
  expect(session.flow.kind).toBe("pasteAim");
  expect(session.clipboard).toBe(clipboard);
  expect(debounce.press(id, 0)).toBe(true);
  engine.handlers.get("leave")?.({ playerId: id });
  expect(repo.get(id)).toBeUndefined();
  expect(debounce.press(id, 0)).toBe(true);
});
