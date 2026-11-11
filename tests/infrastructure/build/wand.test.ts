import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { FinishRotateMode } from "../../../src/application/build/finishRotateMode";
import { PasteAt } from "../../../src/application/build/pasteAt";
import type { AimReader } from "../../../src/application/build/ports/aim";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { SetPoint } from "../../../src/application/build/setPoint";
import { TapAir } from "../../../src/application/build/tapAir";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { aimedPasteTarget } from "../../../src/domain/build/clipboard/clipboard";
import { beginRotateMode } from "../../../src/domain/build/flow/rotateMode";
import { PressDebounces } from "../../../src/domain/build/pressDebounce";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import { SELECTION_WAND_TYPE } from "../../../src/infrastructure/build/identifiers";
import { InMemorySessionRepository } from "../../../src/infrastructure/build/persistence/inMemorySessionRepository";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeWorld,
  nether,
} from "../../application/build/fakes";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";

const menus = {
  showShapeMenu: vi.fn(),
  showContentsMenu: vi.fn(),
  showUtilityMenu: vi.fn(),
  showPasteMenu: vi.fn(),
  showHeightSlider: vi.fn(),
};

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
        vi.clearAllMocks();
        const repo = new InMemorySessionRepository();
        const feedback: BuildFeedback = {
          showMessage: vi.fn(),
          showSize: vi.fn(),
          showMode: vi.fn(),
          showUndoHint: vi.fn(),
          drawPreview: vi.fn(),
        };
        const blocks = new FakeWorld();
        blocks.put({ x, y, z }, blockStateOf("minecraft:stone"));
        registerWand({
          rotateModeTap: { execute: vi.fn() },
          finishRotateMode: { execute: vi.fn() },
          rotateDebounce: new PressDebounces<PlayerId>(
            BUILD_SPEC.rotateDebounceTicks,
          ),
          confirmBoxStep: { execute: vi.fn() },
          aimHeight: new AimHeight(repo),
          repo,
          pressPasteAim: new PressPasteAim(
            repo,
            new PasteAt(
              repo,
              blocks,
              feedback,
              new FakeStructureStore(),
              new FakeBuildPlayers(),
            ),
            feedback,
          ),
          setPoint: new SetPoint(repo, blocks, feedback),
          tapAir: new TapAir(repo, feedback),
          menus,
          aim: {
            aim: () => ({
              ray: {
                origin: { x: 0, y: 0, z: 0 },
                direction: { x: 1, y: 0, z: 0 },
              },
              block: { cell: { x, y, z }, face: "up" as const },
            }),
          },
          debounce: new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks),
          pasteDebounce: new PressDebounces<PlayerId>(
            BUILD_SPEC.pasteRepeatTicks,
          ),
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
        expect(menus.showShapeMenu).toHaveBeenCalledTimes(holding ? 1 : 0);
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

function setupAir() {
  engine.tick = 0;
  engine.scheduled.length = 0;
  const repo = new InMemorySessionRepository();
  const feedback: BuildFeedback = {
    showMessage: vi.fn(),
    showSize: vi.fn(),
    showMode: vi.fn(),
    showUndoHint: vi.fn(),
    drawPreview: vi.fn(),
  };
  const blocks = new FakeWorld();
  const setPoint = new SetPoint(repo, blocks, feedback);
  const tapAir = new TapAir(repo, feedback);
  const aimHeight = new AimHeight(repo);
  const confirmBoxStep = { execute: vi.fn() };
  const roofExecute = vi.spyOn(aimHeight, "execute");
  const pointExecute = vi.spyOn(setPoint, "execute");
  const execute = vi.spyOn(tapAir, "execute");
  const menus = {
    showShapeMenu: vi.fn(),
    showContentsMenu: vi.fn(),
    showUtilityMenu: vi.fn(),
    showPasteMenu: vi.fn(),
    showHeightSlider: vi.fn(),
  };
  const aim: AimReader = {
    aim: () => ({
      ray: {
        origin: { x: 0.5, y: 5.5, z: 0.5 },
        direction: { x: 1, y: 0, z: 0 },
      },
    }),
  };
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const player = {
    id: "p",
    dimension: { id: "minecraft:nether" },
    isValid: true,
    isSneaking: false,
    selectedSlotIndex: 0,
    getComponent: () => ({
      container: { getItem: () => ({ typeId: SELECTION_WAND_TYPE }) },
    }),
  };
  const id = asPlayerId(player.id);
  const session = repo.getOrCreate(id);
  session.setFlow({
    kind: "point1",
    dimensionId: asDimensionId("minecraft:overworld"),
    cell: { x: 10, y: 0, z: 0 },
    material: blockStateOf("minecraft:stone"),
  });
  const structures = new FakeStructureStore();
  const paste = new PasteAt(
    repo,
    blocks,
    feedback,
    structures,
    new FakeBuildPlayers(),
  );
  const pressPasteAim = new PressPasteAim(repo, paste, feedback);
  const rotateModeTap = { execute: vi.fn() };
  const finishRotateMode = new FinishRotateMode(repo);
  const finishExecute = vi.spyOn(finishRotateMode, "execute");
  registerWand({
    rotateModeTap,
    finishRotateMode,
    rotateDebounce: new PressDebounces<PlayerId>(
      BUILD_SPEC.rotateDebounceTicks,
    ),
    confirmBoxStep,
    aimHeight,
    repo,
    pressPasteAim,
    setPoint,
    tapAir,
    menus,
    aim,
    debounce,
    pasteDebounce: new PressDebounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks),
    pointOf: () =>
      session.flow.kind === "point1" ? session.flow.cell : undefined,
  });
  const use = () =>
    engine.handlers.get("use")?.({
      source: player,
      itemStack: { typeId: SELECTION_WAND_TYPE },
    });
  return {
    rotateModeTap,
    finishExecute,
    repo,
    session,
    id,
    player,
    use,
    execute,
    menus,
    aim,
    debounce,
    pasteDebounce: new PressDebounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks),
    confirmBoxStep,
    roofExecute,
    pointExecute,
    paste,
    pressPasteAim,
    structures,
    feedback,
  };
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

it.each(["gable", "hip"] as const)(
  "confirms aimed %s height once on the first block event, including paired itemUse",
  (kind) => {
    const e = setupRoof(kind);
    const target = {
      ray: e.ray,
      block: { cell: { x: 90, y: 80, z: 70 }, face: "up" as const },
    };
    e.aim.aim = vi.fn(() => target);
    const event = {
      player: e.player,
      block: {
        dimension: { id: "minecraft:nether" },
        location: target.block.cell,
      },
      isFirstEvent: true,
      cancel: false,
    };
    engine.handlers.get("interact")?.(event);
    engine.handlers.get("interact")?.({ ...event, isFirstEvent: false });
    e.use();
    expect(event.cancel).toBe(true);
    expect(e.roofExecute).not.toHaveBeenCalled();
    expect(e.menus.showContentsMenu).not.toHaveBeenCalled();
    for (const callback of engine.scheduled.splice(0)) callback();
    e.use();
    expect(e.aim.aim).toHaveBeenCalledWith(e.id);
    expectRoofTap(e);
  },
);

it.each(["gable", "hip"] as const)(
  "confirms aimed %s height once on an air press, even while sneaking",
  (kind) => {
    for (const sneaking of [false, true]) {
      const e = setupRoof(kind);
      e.player.isSneaking = sneaking;
      const read = vi.spyOn(e.aim, "aim");
      for (const tick of [0, 4, 10, 15]) {
        engine.tick = tick;
        e.use();
      }
      for (const callback of engine.scheduled.splice(0)) callback();
      expect(read).toHaveBeenCalledExactlyOnceWith(e.id);
      expectRoofTap(e);
    }
  },
);

function setupRoof(kind: "gable" | "hip") {
  const e = setupAir();
  e.session.setFlow({
    kind: "endpoint",
    dimensionId: nether,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 4, y: 0, z: 4 },
    material: blockStateOf("minecraft:stone"),
  });
  new ChooseHeighted(e.repo, e.feedback).execute({ playerId: e.id, kind });
  const flow = e.session.flow;
  const ray = {
    origin: { x: -10, y: 5, z: 2.5 },
    direction: { x: 1, y: 0, z: 0 },
  };
  e.aim.aim = () => ({ ray });
  e.menus.showContentsMenu.mockImplementation(() => {
    expect(e.session.flow).toEqual({ ...flow, previous: 5 });
  });
  return { ...e, flow, ray };
}

function expectRoofTap(e: ReturnType<typeof setupRoof>) {
  expect(e.roofExecute).toHaveBeenCalledExactlyOnceWith({
    playerId: e.id,
    ray: e.ray,
  });
  expect(e.menus.showContentsMenu).toHaveBeenCalledExactlyOnceWith(e.player);
  expect(e.roofExecute.mock.invocationCallOrder[0]).toBeLessThan(
    e.menus.showContentsMenu.mock.invocationCallOrder[0] as number,
  );
  expect(e.session.flow).toEqual({ ...e.flow, previous: 5 });
  expect(e.pointExecute).not.toHaveBeenCalled();
  expect(e.execute).not.toHaveBeenCalled();
  expect(e.menus.showShapeMenu).not.toHaveBeenCalled();
  expect(e.menus.showUtilityMenu).not.toHaveBeenCalled();
}

it("opens the utility menu once for a held sneak air press without clearing the flow", () => {
  const { player, use, menus, execute, session } = setupAir();
  player.isSneaking = true;
  for (const tick of [0, 4, 10]) {
    engine.tick = tick;
    use();
  }
  expect(menus.showUtilityMenu).toHaveBeenCalledExactlyOnceWith(player);
  expect(execute).not.toHaveBeenCalled();
  expect(session.flow.kind).toBe("point1");
});

it("opens the utility menu on a plain air press when idle", () => {
  const { player, use, menus, execute, session } = setupAir();
  session.setFlow({ kind: "idle" });
  use();
  expect(menus.showUtilityMenu).toHaveBeenCalledExactlyOnceWith(player);
  expect(execute).not.toHaveBeenCalled();
  expect(session.flow.kind).toBe("idle");
});

it("still fixes the virtual end point on a plain air press during point1 and endpoint", () => {
  const { use, menus, execute, session } = setupAir();
  use();
  expect(session.flow.kind).toBe("endpoint");
  engine.tick = 10;
  use();
  expect(execute).toHaveBeenCalledTimes(2);
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
});

it("opens the utility menu on a sneak air press in point1 and endpoint", () => {
  const { player, use, menus, session } = setupAir();
  player.isSneaking = true;
  use();
  expect(session.flow.kind).toBe("point1");
  expect(menus.showUtilityMenu).toHaveBeenCalledTimes(1);
  session.setFlow({
    kind: "endpoint",
    dimensionId: asDimensionId("minecraft:overworld"),
    from: { x: 10, y: 0, z: 0 },
    to: { x: 12, y: 0, z: 0 },
    material: blockStateOf("minecraft:stone"),
  });
  engine.tick = 10;
  use();
  expect(menus.showUtilityMenu).toHaveBeenCalledTimes(2);
});

it("does nothing on an air press without a session", () => {
  const { repo, id, use, menus } = setupAir();
  repo.remove(id);
  use();
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
  expect(repo.get(id)).toBeUndefined();
});

it("ignores itemUse for an aimed block, even before the deferred interact callback", () => {
  const { aim, use, execute, menus, player } = setupAir();
  aim.aim = () => ({
    ray: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: { x: 1, y: 0, z: 0 }, face: "up" as const },
  });
  use();
  engine.tick = 10;
  player.isSneaking = true;
  use();
  expect(execute).not.toHaveBeenCalled();
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
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
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
});

it("routes paste aiming through itemUse with live aim and separate commit debounce", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("up", "down", "north", "south", "east", "west"),
      fc.record({
        x: fc.integer({ min: -100, max: 100 }),
        y: fc.integer({ min: 0, max: 200 }),
        z: fc.integer({ min: -100, max: 100 }),
      }),
      fc.boolean(),
      fc.boolean(),
      (face, block, hasBlock, sneaking) => {
        const e = setupAir();
        e.player.isSneaking = sneaking;
        const clipboard = structureClipboard(
          boxOf(block, block),
          () => blockStateOf("minecraft:stone"),
          e.structures,
        );
        holdClipboard(e.session, clipboard);
        e.session.setFlow({ kind: "pasteAim", turn: 0 });
        const flow = e.session.flow;
        const target = {
          ray: { origin: block, direction: { x: 1, y: 0, z: 0 } },
          block: hasBlock ? { cell: block, face } : undefined,
        };
        e.aim.aim = vi.fn(() => target);
        const pasteCall = vi.spyOn(e.paste, "execute");
        const pressCall = vi.spyOn(e.pressPasteAim, "execute");
        for (const isFirstEvent of [true, false]) {
          const event = {
            player: e.player,
            block: { dimension: { id: "minecraft:nether" }, location: block },
            isFirstEvent,
            cancel: false,
          };
          engine.handlers.get("interact")?.(event);
          expect(event.cancel).toBe(true);
        }
        expect(engine.scheduled).toHaveLength(0);
        expect(pasteCall).not.toHaveBeenCalled();
        expect(e.session.flow).toBe(flow);
        for (const tick of [0, 4, 10, 15]) {
          engine.tick = tick;
          e.use();
        }
        expect(e.aim.aim).toHaveBeenCalledExactlyOnceWith(e.id);
        expect(pressCall).toHaveBeenCalledExactlyOnceWith({
          playerId: e.id,
          dimensionId: nether,
          aim: target,
          tick: 0,
          sneaking,
        });
        if (hasBlock && sneaking) {
          expect(pasteCall).toHaveBeenCalledExactlyOnceWith({
            playerId: e.id,
            dimensionId: nether,
            target: aimedPasteTarget(clipboard, target),
            tick: 0,
          });
          expect(e.session.isEditing).toBe(false);
          expect(e.structures.calls.at(-1)).toMatchObject({
            kind: "place",
            handle: clipboard.contents.handle,
          });
          expect(e.menus.showPasteMenu).not.toHaveBeenCalled();
        } else {
          expect(pasteCall).not.toHaveBeenCalled();
          expect(e.session.isEditing).toBe(false);
          expect(e.menus.showPasteMenu).toHaveBeenCalledTimes(sneaking ? 0 : 1);
        }
        expect(e.pointExecute).not.toHaveBeenCalled();
        expect(e.execute).not.toHaveBeenCalled();
        expect(e.menus.showUtilityMenu).not.toHaveBeenCalled();
      },
    ),
  );
});

it("opens only on entering endpoint and defers an air-triggered menu safely", () => {
  engine.tick = 0;
  engine.scheduled.length = 0;
  vi.clearAllMocks();
  const repo = new InMemorySessionRepository();
  const feedback = new FakeFeedback();
  const blocks = new FakeWorld();
  const id = asPlayerId("p");
  const session = repo.getOrCreate(id);
  const from = { x: 0, y: 60, z: 0 };
  const to = { x: 4, y: 60, z: 4 };
  const point1 = {
    kind: "point1" as const,
    dimensionId: nether,
    cell: from,
    material: blockStateOf("minecraft:stone"),
  };
  session.setFlow(point1);
  const air = new TapAir(repo, feedback);
  const execute = air.execute.bind(air);
  vi.spyOn(air, "execute").mockImplementation((cmd) =>
    execute({ ...cmd, end: to }),
  );
  registerWand({
    rotateModeTap: { execute: vi.fn() },
    finishRotateMode: { execute: vi.fn() },
    rotateDebounce: new PressDebounces<PlayerId>(
      BUILD_SPEC.rotateDebounceTicks,
    ),
    confirmBoxStep: { execute: vi.fn() },
    aimHeight: new AimHeight(repo),
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: air,
    repo,
    pressPasteAim: new PressPasteAim(
      repo,
      new PasteAt(
        repo,
        blocks,
        feedback,
        new FakeStructureStore(),
        new FakeBuildPlayers(),
      ),
      feedback,
    ),
    menus,
    aim: {
      aim: () => ({ ray: { origin: from, direction: { x: 1, y: 0, z: 0 } } }),
    },
    debounce: new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks),
    pasteDebounce: new PressDebounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks),
    pointOf: () =>
      session.flow.kind === "point1" ? session.flow.cell : undefined,
  });
  const player = { id, isValid: true, isSneaking: false };
  const event = { source: player, itemStack: { typeId: SELECTION_WAND_TYPE } };
  engine.handlers.get("use")?.(event);
  expect(session.flow.kind).toBe("endpoint");
  expect(menus.showShapeMenu).not.toHaveBeenCalled();
  for (const callback of engine.scheduled.splice(0)) callback();
  expect(menus.showShapeMenu).toHaveBeenCalledExactlyOnceWith(player);
  engine.tick = BUILD_SPEC.pressDebounceTicks;
  engine.handlers.get("use")?.(event);
  expect(engine.scheduled).toHaveLength(0);
  session.setFlow(point1);
  engine.tick += BUILD_SPEC.pressDebounceTicks;
  engine.handlers.get("use")?.(event);
  player.isValid = false;
  for (const callback of engine.scheduled.splice(0)) callback();
  expect(menus.showShapeMenu).toHaveBeenCalledTimes(1);
});

it.each(["block", "air"])(
  "confirms Copy after aiming from a %s tap without contents",
  (tap) => {
    const e = setupRoof("gable");
    if (e.flow.kind !== "heightStep") throw new Error("Expected height step");
    e.session.setFlow({ ...e.flow, heightedKind: "copy" });
    e.confirmBoxStep.execute.mockImplementation(() => {
      expect(e.session.flow).toMatchObject({
        heightedKind: "copy",
        previous: 5,
      });
    });
    if (tap === "air") e.use();
    else {
      engine.handlers.get("interact")?.({
        player: e.player,
        block: {
          dimension: { id: "minecraft:nether" },
          location: { x: 0, y: 0, z: 0 },
        },
        isFirstEvent: true,
        cancel: false,
      });
      for (const callback of engine.scheduled.splice(0)) callback();
    }
    expect(e.confirmBoxStep.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: e.id,
    });
    expect(e.roofExecute.mock.invocationCallOrder[0]).toBeLessThan(
      e.confirmBoxStep.execute.mock.invocationCallOrder[0] as number,
    );
    expect(e.menus.showContentsMenu).not.toHaveBeenCalled();
  },
);
it.each(["block", "air"])(
  "confirms Cut after aiming from a %s tap without contents",
  (tap) => {
    const e = setupRoof("gable");
    if (e.flow.kind !== "heightStep") throw new Error("Expected height step");
    e.session.setFlow({ ...e.flow, heightedKind: "cut" });
    e.confirmBoxStep.execute.mockImplementation(() => {
      expect(e.session.flow).toMatchObject({
        heightedKind: "cut",
        previous: 5,
      });
    });
    if (tap === "air") e.use();
    else {
      engine.handlers.get("interact")?.({
        player: e.player,
        block: {
          dimension: { id: "minecraft:nether" },
          location: { x: 0, y: 0, z: 0 },
        },
        isFirstEvent: true,
        cancel: false,
      });
      for (const callback of engine.scheduled.splice(0)) callback();
    }
    expect(e.confirmBoxStep.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: e.id,
    });
    expect(e.roofExecute.mock.invocationCallOrder[0]).toBeLessThan(
      e.confirmBoxStep.execute.mock.invocationCallOrder[0] as number,
    );
    expect(e.menus.showContentsMenu).not.toHaveBeenCalled();
  },
);

it("opens the paste menu even when the aim reader returns undefined", () => {
  const e = setupAir();
  holdClipboard(
    e.session,
    structureClipboard(
      boxOf({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
      () => blockStateOf("minecraft:stone"),
      e.structures,
    ),
  );
  e.session.setFlow({ kind: "pasteAim", turn: 0 });
  e.aim.aim = () => undefined;
  e.use();
  expect(e.menus.showPasteMenu).toHaveBeenCalledExactlyOnceWith(e.player);
});

it("accepts a commit immediately after the menu and suppresses a second commit at another anchor", () => {
  const e = setupAir();
  const block = { x: 0, y: 0, z: 0 };
  holdClipboard(
    e.session,
    structureClipboard(
      boxOf(block, block),
      () => blockStateOf("minecraft:stone"),
      e.structures,
    ),
  );
  e.session.setFlow({ kind: "pasteAim", turn: 0 });
  e.aim.aim = () => ({
    ray: { origin: block, direction: { x: 1, y: 0, z: 0 } },
    block: { cell: { ...block, x: engine.tick }, face: "up" },
  });
  const paste = vi.spyOn(e.paste, "execute");
  e.use();
  expect(e.menus.showPasteMenu).toHaveBeenCalledExactlyOnceWith(e.player);
  expect(paste).not.toHaveBeenCalled();
  e.player.isSneaking = true;
  engine.tick = 1;
  e.use();
  expect(paste).toHaveBeenCalledTimes(1);
  engine.tick = BUILD_SPEC.pasteRepeatTicks;
  e.use();
  expect(paste).toHaveBeenCalledTimes(1);
  engine.tick += BUILD_SPEC.pasteRepeatTicks;
  e.use();
  expect(paste).toHaveBeenCalledTimes(2);
});

function setupRotate() {
  const e = setupAir();
  const cell = { x: 0, y: 60, z: 0 };
  e.session.setFlow(
    beginRotateMode(
      nether,
      boxOf(cell, { ...cell, x: 2, z: 4 }),
      blockStateOf("minecraft:stone"),
      1,
    ),
  );
  return e;
}

it.each(["air", "block", "missing"])(
  "routes one rotate tap with %s aim and cancels duplicate interactions",
  (target) => {
    const e = setupRotate();
    if (target === "missing") e.aim.aim = () => undefined;
    if (target === "block")
      e.aim.aim = () => ({
        ray: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        block: { cell: { x: 1, y: 0, z: 0 }, face: "up" },
      });
    const event = {
      player: e.player,
      block: {
        dimension: { id: "minecraft:nether" },
        location: { x: 0, y: 0, z: 0 },
      },
      isFirstEvent: true,
      cancel: false,
    };
    engine.handlers.get("interact")?.(event);
    expect(event.cancel).toBe(true);
    expect(engine.scheduled).toHaveLength(0);
    expect(e.rotateModeTap.execute).not.toHaveBeenCalled();
    e.use();
    expect(e.rotateModeTap.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: e.id,
      dimensionId: nether,
    });
    expect(e.pointExecute).not.toHaveBeenCalled();
    expect(e.menus.showUtilityMenu).not.toHaveBeenCalled();
  },
);

it("rechecks rotate mode before a deferred block interaction", () => {
  const e = setupAir();
  engine.handlers.get("interact")?.({
    player: e.player,
    block: {
      dimension: { id: "minecraft:nether" },
      location: { x: 0, y: 0, z: 0 },
    },
    isFirstEvent: true,
  });
  e.session.setFlow(
    beginRotateMode(
      nether,
      boxOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }),
      blockStateOf("minecraft:stone"),
      1,
    ),
  );
  for (const callback of engine.scheduled.splice(0)) callback();
  expect(e.pointExecute).not.toHaveBeenCalled();
  expect(e.rotateModeTap.execute).not.toHaveBeenCalled();
});

it.each([7, 8, 9])("accepts separate rotate taps %s ticks apart", (gap) => {
  const e = setupRotate();
  for (const tick of [0, gap, gap * 2]) {
    engine.tick = tick;
    e.use();
  }
  expect(e.rotateModeTap.execute).toHaveBeenCalledTimes(3);
});

it.each([4, 5, 6])("suppresses held rotate repeats every %s ticks", (gap) => {
  const e = setupRotate();
  for (let tick = 0; tick < 40; tick += gap) {
    engine.tick = tick;
    e.use();
  }
  expect(e.rotateModeTap.execute).toHaveBeenCalledTimes(1);
});

it("finishes on sneak and suppresses held repeats from opening utilities", () => {
  const e = setupRotate();
  e.player.isSneaking = true;
  e.aim.aim = () => undefined;
  e.use();
  expect(e.finishExecute).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
  expect(e.session.flow.kind).toBe("endpoint");
  e.aim.aim = () => ({
    ray: { origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
  });
  for (const tick of [4, 9, 15, 20]) {
    engine.tick = tick;
    e.use();
  }
  expect(e.rotateModeTap.execute).not.toHaveBeenCalled();
  expect(e.menus.showUtilityMenu).not.toHaveBeenCalled();
});
