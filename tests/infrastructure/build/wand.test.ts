import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { ClearSelection } from "../../../src/application/build/clearSelection";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { SetPoint } from "../../../src/application/build/setPoint";
import { StartPaste } from "../../../src/application/build/startPaste";
import { TapAir } from "../../../src/application/build/tapAir";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import { SELECTION_WAND_TYPE } from "../../../src/infrastructure/build/identifiers";
import { InMemorySessionRepository } from "../../../src/infrastructure/build/persistence/inMemorySessionRepository";
import { FakeFeedback, FakeWorld, nether } from "../../application/build/fakes";

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
  Direction: {
    Up: "Up",
    Down: "Down",
    North: "North",
    South: "South",
    East: "East",
    West: "West",
  },
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

it("preserves blocks and defers point taps out of before events", () => {
  fc.assert(
    fc.property(
      fc.integer(),
      fc.integer(),
      fc.integer(),
      fc.boolean(),
      (x, y, z, holding) => {
        engine.scheduled.length = 0;
        const repo = new InMemorySessionRepository();
        const feedback: BuildFeedback = {
          showMessage: vi.fn(),
          drawPreview: vi.fn(),
        };
        const blocks = new FakeWorld();
        blocks.put({ x, y, z }, blockStateOf("minecraft:stone"));
        registerWand(
          new SetPoint(repo, blocks, feedback),
          new TapAir(repo, feedback),
          new ClearSelection(repo, feedback),
          repo,
          new PasteAt(
            repo,
            blocks,
            feedback,
            new EditJobs(repo, blocks, feedback),
          ),
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
        const pointCell = () => {
          const flow = repo.get(id)?.flow;
          return flow?.kind === "point1" ? flow.cell : undefined;
        };
        expect(engine.handlers.has("hit")).toBe(false);
        engine.handlers.get("hit")?.({
          damagingEntity: player,
          hitBlock: block,
        });
        expect(repo.get(id)).toBeUndefined();
        expect(engine.scheduled).toHaveLength(0);
        const breakEvent = { player, cancel: false };
        engine.handlers.get("break")?.(breakEvent);
        expect(breakEvent.cancel).toBe(holding);
        const interact = { player, block, isFirstEvent: true, cancel: false };
        engine.handlers.get("interact")?.(interact);
        expect(interact.cancel).toBe(holding);
        expect(pointCell()).toBeUndefined();
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(pointCell()).toEqual(holding ? block.location : undefined);
        engine.handlers.get("interact")?.({ ...interact, isFirstEvent: false });
        expect(engine.scheduled).toHaveLength(0);
        engine.handlers.get("use")?.({
          source: player,
          itemStack: { typeId: SELECTION_WAND_TYPE },
        });
        expect(pointCell()).toEqual(holding ? block.location : undefined);
        engine.handlers.get("interact")?.(interact);
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(repo.get(id)?.flow.kind).toBe(holding ? "endpoint" : undefined);
        player.isSneaking = true;
        engine.handlers.get("use")?.({
          source: player,
          itemStack: { typeId: SELECTION_WAND_TYPE },
        });
        expect(repo.get(id)?.flow.kind).toBe(holding ? "idle" : undefined);
        expect(feedback.showMessage).toHaveBeenLastCalledWith(
          id,
          "selectionCleared",
        );
        engine.handlers.get("interact")?.(interact);
        player.isValid = false;
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(repo.get(id)?.flow.kind).toBe(holding ? "idle" : undefined);
      },
    ),
  );
});

it("routes each engine face to aimed paste in the hit dimension after the before event", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("Up", "Down", "North", "South", "East", "West"),
      fc.record({
        x: fc.integer({ min: -100, max: 100 }),
        y: fc.integer({ min: 0, max: 200 }),
        z: fc.integer({ min: -100, max: 100 }),
      }),
      fc.boolean(),
      (face, block, skipAir) => {
        engine.scheduled.length = 0;
        const repo = new InMemorySessionRepository();
        const id = asPlayerId("p");
        const session = repo.getOrCreate(id);
        const feedback = new FakeFeedback();
        const blocks = new FakeWorld();
        session.setClipboard(
          clipboardOf(boxOf(block, block), () =>
            blockStateOf("minecraft:stone"),
          ),
        );
        new StartPaste(repo).execute({ playerId: id, skipAir });
        const flow = session.flow;
        const jobs = new EditJobs(repo, blocks, feedback);
        const point = new SetPoint(repo, blocks, feedback);
        const pointCall = vi.spyOn(point, "execute");
        registerWand(
          point,
          new TapAir(repo, feedback),
          new ClearSelection(repo, feedback),
          repo,
          new PasteAt(repo, blocks, feedback, jobs),
        );
        const player = {
          id: "p",
          typeId: "minecraft:player",
          isValid: true,
          selectedSlotIndex: 0,
          getComponent: () => ({
            container: { getItem: () => ({ typeId: SELECTION_WAND_TYPE }) },
          }),
        };
        const event = {
          player,
          block: { dimension: { id: "minecraft:nether" }, location: block },
          blockFace: face,
          isFirstEvent: true,
          cancel: false,
        };
        engine.handlers.get("interact")?.(event);
        expect(event.cancel).toBe(true);
        expect(session.flow).toBe(flow);
        expect(session.isEditing).toBe(false);
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(pointCall).not.toHaveBeenCalled();
        expect(session.flow.kind).toBe("idle");
        jobs.step();
        const offset = {
          Up: [0, 1, 0],
          Down: [0, -1, 0],
          North: [0, 0, -1],
          South: [0, 0, 1],
          East: [1, 0, 0],
          West: [-1, 0, 0],
        }[face];
        expect(
          blocks.stateAt(nether, {
            x: block.x + (offset[0] as number),
            y: block.y + (offset[1] as number),
            z: block.z + (offset[2] as number),
          }),
        ).toEqual(blockStateOf("minecraft:stone"));
      },
    ),
  );
});
