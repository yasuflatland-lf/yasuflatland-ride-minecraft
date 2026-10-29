import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { SetCorner } from "../../../src/application/build/setCorner";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import { SELECTION_WAND_TYPE } from "../../../src/infrastructure/build/identifiers";
import { InMemorySessionRepository } from "../../../src/infrastructure/build/persistence/inMemorySessionRepository";

const engine = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const scheduled: (() => void)[] = [];
  const event = (name: string) => ({
    subscribe: (handler: (event: unknown) => void) =>
      handlers.set(name, handler),
  });
  return { handlers, scheduled, event };
});
vi.mock("@minecraft/server", () => ({
  world: {
    afterEvents: {
      entityHitBlock: engine.event("hit"),
      itemUse: engine.event("use"),
    },
    beforeEvents: {
      playerBreakBlock: engine.event("break"),
      playerInteractWithBlock: engine.event("interact"),
    },
  },
  system: { run: (callback: () => void) => engine.scheduled.push(callback) },
}));

it("sets the first corner immediately, preserves the block, and defers the second corner out of before events", () => {
  fc.assert(
    fc.property(
      fc.integer(),
      fc.integer(),
      fc.integer(),
      fc.boolean(),
      (x, y, z, holding) => {
        engine.scheduled.length = 0;
        const repo = new InMemorySessionRepository();
        const gate = {
          ridesBulldozer: () => true,
          bulldozerFeet: () => undefined,
        };
        const feedback: BuildFeedback = {
          showMessage: vi.fn(),
          drawCorner: vi.fn(),
          drawOutline: vi.fn(),
        };
        registerWand(
          new SetCorner(repo, gate, feedback),
          new ClearSelection(repo, gate, feedback),
        );
        const player = {
          id: "p",
          typeId: "minecraft:player",
          isValid: true,
          isSneaking: false,
          selectedSlotIndex: 0,
          getComponent: () => ({
            container: {
              getItem: () => ({
                typeId: holding ? SELECTION_WAND_TYPE : "minecraft:stick",
              }),
            },
          }),
        };
        const block = {
          dimension: { id: "minecraft:overworld" },
          location: { x, y, z },
        };
        const id = asPlayerId(player.id);
        engine.handlers.get("hit")?.({
          damagingEntity: player,
          hitBlock: block,
        });
        expect(repo.get(id)?.selection?.pos1).toEqual(
          holding ? block.location : undefined,
        );
        expect(engine.scheduled).toHaveLength(0);
        const breakEvent = { player, cancel: false };
        engine.handlers.get("break")?.(breakEvent);
        expect(breakEvent.cancel).toBe(holding);
        const interact = { player, block, isFirstEvent: true, cancel: false };
        engine.handlers.get("interact")?.(interact);
        expect(interact.cancel).toBe(holding);
        expect(repo.get(id)?.selection?.pos2).toBeUndefined();
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(repo.get(id)?.selection?.pos2).toEqual(
          holding ? block.location : undefined,
        );
        engine.handlers.get("interact")?.({ ...interact, isFirstEvent: false });
        expect(engine.scheduled).toHaveLength(0);
        engine.handlers.get("use")?.({
          source: player,
          itemStack: { typeId: SELECTION_WAND_TYPE },
        });
        expect(repo.get(id)?.selection?.pos1).toEqual(
          holding ? block.location : undefined,
        );
        player.isSneaking = true;
        engine.handlers.get("use")?.({
          source: player,
          itemStack: { typeId: SELECTION_WAND_TYPE },
        });
        expect(repo.get(id)?.selection).toBeUndefined();
        expect(feedback.showMessage).toHaveBeenLastCalledWith(
          id,
          "selectionCleared",
        );
        engine.handlers.get("interact")?.(interact);
        player.isValid = false;
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(repo.get(id)?.selection).toBeUndefined();
      },
    ),
  );
});
