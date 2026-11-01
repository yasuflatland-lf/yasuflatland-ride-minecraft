import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { AimHeight } from "../../../src/application/build/aimHeight";
import { CancelFlow } from "../../../src/application/build/cancelFlow";
import { ChooseHeighted } from "../../../src/application/build/chooseHeighted";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import type { AimReader } from "../../../src/application/build/ports/aim";
import type { BuildFeedback } from "../../../src/application/build/ports/feedback";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { SetPoint } from "../../../src/application/build/setPoint";
import { TapAir } from "../../../src/application/build/tapAir";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import {
  aimedPasteTarget,
  clipboardOf,
} from "../../../src/domain/build/clipboard/clipboard";
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
          showPasteHint: vi.fn(),
          drawPreview: vi.fn(),
        };
        const blocks = new FakeWorld();
        blocks.put({ x, y, z }, blockStateOf("minecraft:stone"));
        registerWand({
          confirmCopyHeight: { execute: vi.fn() },
          aimHeight: new AimHeight(repo),
          repo,
          pressPasteAim: new PressPasteAim(
            repo,
            new PasteAt(
              repo,
              blocks,
              feedback,
              new EditJobs(repo, blocks, feedback),
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
    showPasteHint: vi.fn(),
    drawPreview: vi.fn(),
  };
  const blocks = new FakeWorld();
  const setPoint = new SetPoint(repo, blocks, feedback);
  const tapAir = new TapAir(repo, feedback);
  const aimHeight = new AimHeight(repo);
  const confirmCopyHeight = { execute: vi.fn() };
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
  const paste = new PasteAt(
    repo,
    blocks,
    feedback,
    new EditJobs(repo, blocks, feedback),
  );
  registerWand({
    confirmCopyHeight,
    aimHeight,
    repo,
    pressPasteAim: new PressPasteAim(repo, paste, feedback),
    setPoint,
    tapAir,
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
  return {
    repo,
    session,
    id,
    player,
    use,
    execute,
    menus,
    aim,
    debounce,
    confirmCopyHeight,
    roofExecute,
    pointExecute,
    paste,
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

it("routes paste aiming through itemUse with live aim and shared debounce", () => {
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
        const clipboard = clipboardOf(boxOf(block, block), () =>
          blockStateOf("minecraft:stone"),
        );
        e.session.setClipboard(clipboard);
        e.session.setFlow({ kind: "pasteAim", skipAir: false });
        const flow = e.session.flow;
        const target = {
          ray: { origin: block, direction: { x: 1, y: 0, z: 0 } },
          block: hasBlock ? { cell: block, face } : undefined,
        };
        e.aim.aim = vi.fn(() => target);
        const pasteCall = vi.spyOn(e.paste, "execute");
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
        if (hasBlock) {
          expect(pasteCall).toHaveBeenCalledExactlyOnceWith({
            playerId: e.id,
            dimensionId: nether,
            target: aimedPasteTarget(clipboard, target),
            tick: 0,
          });
          expect(e.session.isEditing).toBe(true);
          expect(e.menus.showPasteMenu).not.toHaveBeenCalled();
        } else {
          expect(pasteCall).not.toHaveBeenCalled();
          expect(e.session.isEditing).toBe(false);
          expect(e.menus.showPasteMenu).toHaveBeenCalledExactlyOnceWith(
            e.player,
          );
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
    confirmCopyHeight: { execute: vi.fn() },
    aimHeight: new AimHeight(repo),
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: air,
    repo,
    pressPasteAim: new PressPasteAim(
      repo,
      new PasteAt(repo, blocks, feedback, new EditJobs(repo, blocks, feedback)),
      feedback,
    ),
    menus,
    aim: {
      aim: () => ({ ray: { origin: from, direction: { x: 1, y: 0, z: 0 } } }),
    },
    debounce: new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks),
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
    e.confirmCopyHeight.execute.mockImplementation(() => {
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
    expect(e.confirmCopyHeight.execute).toHaveBeenCalledExactlyOnceWith({
      playerId: e.id,
    });
    expect(e.roofExecute.mock.invocationCallOrder[0]).toBeLessThan(
      e.confirmCopyHeight.execute.mock.invocationCallOrder[0] as number,
    );
    expect(e.menus.showContentsMenu).not.toHaveBeenCalled();
  },
);
