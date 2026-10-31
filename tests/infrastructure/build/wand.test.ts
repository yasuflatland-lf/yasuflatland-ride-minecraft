import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import type { AimReader } from "../../../src/application/build/ports/aim";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { SetPoint } from "../../../src/application/build/setPoint";
import { StartPaste } from "../../../src/application/build/startPaste";
import { TapAir } from "../../../src/application/build/tapAir";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { clipboardOf } from "../../../src/domain/build/clipboard/clipboard";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import { PressDebounces } from "../../../src/domain/shared/pressDebounce";
import { registerSessions } from "../../../src/infrastructure/build/bedrock/handlers/sessions";
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
  return { handlers, scheduled, event, tick: 0 };
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
      playerLeave: engine.event("leave"),
      playerDimensionChange: engine.event("dimension"),
      entityDie: engine.event("die"),
    },
    beforeEvents: {
      playerBreakBlock: engine.event("break"),
      playerInteractWithBlock: engine.event("interact"),
    },
  },
  system: {
    run: (callback: () => void) => engine.scheduled.push(callback),
    get currentTick() {
      return engine.tick;
    },
  },
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
        registerWand({
          setPoint: new SetPoint(repo, blocks, feedback),
          tapAir: new TapAir(repo, feedback),
          pasteAt: new PasteAt(
            repo,
            blocks,
            feedback,
            new EditJobs(repo, blocks, feedback),
          ),
          repo,
          menus: { openUtility: vi.fn() },
          aim: {
            aim: () => ({
              ray: {
                origin: { x: 0, y: 0, z: 0 },
                direction: { x: 1, y: 0, z: 0 },
              },
              block: { cell: { x, y, z }, face: "Up" },
            }),
          },
          debounce: new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks),
          pointOf: () => undefined,
        });
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
        expect(repo.get(id)?.flow.kind).toBe(holding ? "endpoint" : undefined);
        engine.handlers.get("interact")?.(interact);
        player.isValid = false;
        for (const callback of engine.scheduled.splice(0)) callback();
        expect(repo.get(id)?.flow.kind).toBe(holding ? "endpoint" : undefined);
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
        registerWand({
          setPoint: point,
          tapAir: new TapAir(repo, feedback),
          pasteAt: new PasteAt(repo, blocks, feedback, jobs),
          repo,
          menus: { openUtility: vi.fn() },
          aim: { aim: () => undefined },
          debounce: new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks),
          pointOf: () => undefined,
        });
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

function setupAir() {
  engine.tick = 0;
  const repo = new InMemorySessionRepository();
  const feedback: BuildFeedback = {
    showMessage: vi.fn(),
    drawPreview: vi.fn(),
  };
  const setPoint = new SetPoint(repo, new FakeWorld(), feedback);
  const tapAir = new TapAir(repo, feedback);
  const execute = vi.spyOn(tapAir, "execute");
  const menus = { openUtility: vi.fn() };
  const aim: AimReader = {
    aim: () => ({
      ray: {
        origin: { x: 0.5, y: 5.5, z: 0.5 },
        direction: { x: 1, y: 0, z: 0 },
      },
    }),
  };
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const player = { id: "p", isValid: true, isSneaking: false };
  const id = asPlayerId(player.id);
  const session = repo.getOrCreate(id);
  session.setFlow({
    kind: "point1",
    dimensionId: asDimensionId("minecraft:overworld"),
    cell: { x: 10, y: 0, z: 0 },
    material: blockStateOf("minecraft:stone"),
  });
  registerWand({
    setPoint,
    tapAir,
    pasteAt: new PasteAt(
      repo,
      new FakeWorld(),
      feedback,
      new EditJobs(repo, new FakeWorld(), feedback),
    ),
    repo,
    menus,
    aim,
    debounce,
    pointOf: () =>
      session.flow.kind === "point1" ? session.flow.cell : undefined,
  });
  const use = () =>
    engine.handlers.get("use")?.({
      source: player,
      itemStack: { typeId: SELECTION_WAND_TYPE },
    });
  return { repo, session, id, player, use, execute, menus, aim, debounce };
}

it("computes a virtual air endpoint and ignores held repeats", () => {
  const { session, use, execute } = setupAir();
  use();
  expect(execute).toHaveBeenCalledWith({
    playerId: asPlayerId("p"),
    end: { x: 10, y: 5, z: 0 },
  });
  expect(session.flow.kind).toBe("endpoint");
  for (const tick of [4, 10, 15]) {
    engine.tick = tick;
    use();
  }
  expect(execute).toHaveBeenCalledTimes(1);
  engine.tick = 25;
  use();
  expect(execute).toHaveBeenCalledTimes(2);
});

it("opens the utility menu once for a held sneak air press without clearing the flow", () => {
  const { player, use, menus, execute, session } = setupAir();
  player.isSneaking = true;
  for (const tick of [0, 4, 10]) {
    engine.tick = tick;
    use();
  }
  expect(menus.openUtility).toHaveBeenCalledExactlyOnceWith(asPlayerId("p"));
  expect(execute).not.toHaveBeenCalled();
  expect(session.flow.kind).toBe("point1");
});

it("ignores itemUse for an aimed block, even before the deferred interact callback", () => {
  const { aim, use, execute, menus, player } = setupAir();
  aim.aim = () => ({
    ray: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: { x: 1, y: 0, z: 0 }, face: "Up" },
  });
  use();
  engine.tick = 10;
  player.isSneaking = true;
  use();
  expect(execute).not.toHaveBeenCalled();
  expect(menus.openUtility).not.toHaveBeenCalled();
});

it("ignores unavailable aim, invalid players, and other items", () => {
  const { aim, use, execute, menus, player } = setupAir();
  aim.aim = () => undefined;
  use();
  player.isValid = false;
  engine.tick = 10;
  use();
  player.isValid = true;
  engine.handlers.get("use")?.({
    source: player,
    itemStack: { typeId: "minecraft:stick" },
  });
  expect(execute).not.toHaveBeenCalled();
  expect(menus.openUtility).not.toHaveBeenCalled();
});

it.each(["dimension", "die"])(
  "cancels the flow on %s without dropping the session",
  (event) => {
    const { repo, session, id, player, debounce } = setupAir();
    registerSessions(repo, new CancelFlow(repo), debounce);
    engine.handlers.get(event)?.({
      player,
      deadEntity: { id: player.id, typeId: "minecraft:player" },
    });
    expect(session.flow.kind).toBe("idle");
    expect(repo.get(id)).toBe(session);
  },
);

it("ignores non-player deaths and drops both session and debounce on disconnect", () => {
  const { repo, session, id, debounce } = setupAir();
  registerSessions(repo, new CancelFlow(repo), debounce);
  engine.handlers.get("die")?.({ deadEntity: { id, typeId: "minecraft:pig" } });
  expect(session.flow.kind).toBe("point1");
  expect(debounce.press(id, 0)).toBe(true);
  engine.handlers.get("leave")?.({ playerId: id });
  expect(repo.get(id)).toBeUndefined();
  expect(debounce.press(id, 0)).toBe(true);
});
