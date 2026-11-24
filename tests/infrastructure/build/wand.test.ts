import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { chooseStairs } from "../../../src/domain/build/flow/stairFlow";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { cellOf } from "../../../src/domain/shared/cells";
import { Debounces } from "../../../src/domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { registerWand } from "../../../src/infrastructure/build/bedrock/handlers/wand";
import { SELECTION_WAND_TYPE } from "../../../src/infrastructure/build/identifiers";
import { nether } from "../../application/build/fakes";
import { wandFixture } from "../../application/build/fakes/pressWand";
import {
  holdClipboard,
  structureClipboard,
} from "../../support/buildClipboard";
import { chooseHeightedFlow } from "../../support/buildSelection";

const menus = {
  showContentsMenu: vi.fn(),
  showTerraceMenu: vi.fn(),
  showStairContentsMenu: vi.fn(),
  showUtilityMenu: vi.fn(),
  showPasteMenu: vi.fn(),
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
  system: {
    run: (callback: () => void) => engine.scheduled.push(callback),
    get currentTick() {
      return engine.tick;
    },
  },
}));

const id = asPlayerId("p");
const stone = blockStateOf("minecraft:stone");
const start = cellOf({ x: 0, y: 5, z: 0 });
const end = cellOf({ ...start, x: 4, z: 4 });
const ray = { origin: start, direction: { x: 1, y: 0, z: 0 } };

function setup() {
  vi.clearAllMocks();
  engine.tick = 0;
  engine.scheduled.length = 0;
  const debounce = new Debounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const f = wandFixture((id, tick) => {
    debounce.press(id, tick);
  });
  const player = {
    id,
    isValid: true,
    isSneaking: false,
    dimension: { id: nether },
    held: SELECTION_WAND_TYPE,
    selectedSlotIndex: 0,
    getComponent: () => ({
      container: { getItem: () => ({ typeId: player.held }) },
    }),
  };
  f.world.put(start, stone);
  registerWand({
    repo: f.repo,
    aim: f.aim,
    pressWand: f.press,
    menus,
    debounce,
    pasteDebounce: new Debounces(BUILD_SPEC.pasteRepeatTicks),
  });
  const interact = (location = start, isFirstEvent = true) => {
    const event = {
      player,
      block: { dimension: player.dimension, location },
      isFirstEvent,
      cancel: false,
    };
    engine.handlers.get("interact")?.(event);
    return event;
  };
  const flush = () => {
    for (const run of engine.scheduled.splice(0)) run();
  };
  const use = () =>
    engine.handlers.get("use")?.({
      source: player,
      itemStack: { typeId: player.held },
    });
  const flow = () => f.repo.get(id)?.flow;
  return { ...f, player, interact, flush, use, flow };
}

it("cancels wand interactions and defers only the first block event", () => {
  fc.assert(
    fc.property(
      fc.integer(),
      fc.integer(),
      fc.integer(),
      fc.boolean(),
      (x, y, z, holding) => {
        const f = setup();
        const cell = cellOf({ x, y, z });
        f.world.put(cell, stone);
        if (!holding) f.player.held = "minecraft:stick";
        const breaking = { player: f.player, cancel: false };
        engine.handlers.get("break")?.(breaking);
        expect(breaking.cancel).toBe(holding);
        expect(engine.handlers.has("hit")).toBe(false);
        expect(f.interact(cell).cancel).toBe(holding);
        f.interact(cell, false);
        expect(f.flow()).toBeUndefined();
        expect(engine.scheduled).toHaveLength(holding ? 1 : 0);
        f.flush();
        if (holding)
          expect(f.flow()).toMatchObject({
            kind: "point1",
            start: { dimensionId: nether, cell },
          });
        else expect(f.flow()).toBeUndefined();
      },
    ),
  );
});

it.each(["invalid", "changed intent"] as const)(
  "drops a deferred press when the player or flow changed (%s)",
  (reason) => {
    const f = setup();
    f.interact();
    if (reason === "invalid") f.player.isValid = false;
    else
      f.repo
        .getOrCreate(id)
        .setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
    const before = f.flow();
    f.flush();
    expect(f.flow()).toBe(before);
  },
);

it("ignores air without a session, invalid players, unrelated items and unavailable endpoint aim", () => {
  const f = setup();
  f.aim.target = { input: "pointer", ray };
  f.use();
  expect(f.flow()).toBeUndefined();
  f.interact();
  f.flush();
  const before = f.flow();
  f.player.isValid = false;
  f.use();
  f.player.isValid = true;
  f.player.held = "minecraft:stick";
  f.use();
  f.player.held = SELECTION_WAND_TYPE;
  engine.tick += BUILD_SPEC.pressDebounceTicks;
  f.aim.target = undefined;
  f.use();
  expect(f.flow()).toBe(before);
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
});

it.each(["touch", "pointer"] as const)(
  "shares a height or menu gesture across block and held item use on %s",
  (input) => {
    const f = setup();
    f.interact();
    f.flush();
    f.aim.target = { input, ray, block: { cell: end, face: "up" } };
    f.use();
    expect(f.flow()?.kind).toBe("point1");
    f.interact(end);
    f.flush();
    expect(f.flow()?.kind).toBe("baseHeight");
    for (const kind of ["baseHeight", "selected"] as const) {
      engine.tick += BUILD_SPEC.pressDebounceTicks;
      const opened = menus.showUtilityMenu.mock.calls.length;
      expect(f.interact(end).cancel).toBe(true);
      f.use();
      f.interact(end, false);
      expect(f.flow()?.kind).toBe(kind);
      expect(menus.showUtilityMenu).toHaveBeenCalledTimes(opened);
      f.flush();
      for (const delta of [1, 3, 4]) {
        engine.tick += delta;
        f.use();
      }
      expect(f.flow()?.kind).toBe("selected");
      expect(menus.showUtilityMenu).toHaveBeenCalledTimes(opened + 1);
    }
  },
);

it.each(["air", "block"] as const)(
  "opens roof contents once on a held %s press",
  (target) => {
    const f = setup();
    const session = f.repo.getOrCreate(id);
    f.interact();
    f.flush();
    f.interact(end);
    f.flush();
    f.press.execute({ playerId: id, intent: "confirmLiveHeight", ray });
    session.setFlowForTest(chooseHeightedFlow(session.flow, "gable"));
    f.player.isSneaking = true;
    f.aim.target = {
      input: "touch",
      ray,
      block: target === "block" ? { cell: end, face: "up" } : undefined,
    };
    if (target === "block") f.interact(end);
    f.use();
    f.flush();
    engine.tick++;
    f.use();
    expect(menus.showContentsMenu).toHaveBeenCalledExactlyOnceWith(f.player);
  },
);

it.each(["stairs", "terrace"] as const)(
  "samples the %s goal once for a paired block and item event",
  (op) => {
    const f = setup();
    f.interact();
    f.flush();
    f.interact({ ...start, x: 2 });
    f.flush();
    const session = f.repo.getOrCreate(id);
    session.setFlowForTest(chooseStairs(session.flow, op));
    f.aim.target = {
      input: "pointer",
      ray,
      block: { cell: cellOf({ ...end, y: start.y + 2 }), face: "up" },
    };
    const read = vi.spyOn(f.aim, "aim");
    f.interact(end);
    f.use();
    f.flush();
    expect(read).toHaveBeenCalledExactlyOnceWith(id);
    expect(
      op === "stairs" ? menus.showStairContentsMenu : menus.showTerraceMenu,
    ).toHaveBeenCalledExactlyOnceWith(f.player);
  },
);

it("accepts a paste immediately after its menu and suppresses repeats across the switch to selection", () => {
  const f = setup();
  const session = f.repo.getOrCreate(id);
  holdClipboard(
    session,
    structureClipboard(boxOf(start, start), () => stone, f.structures),
  );
  session.setFlowForTest({ kind: "pasteAim", manualTurn: 0 });
  expect(f.interact().cancel).toBe(true);
  expect(engine.scheduled).toHaveLength(0);
  f.use();
  expect(menus.showPasteMenu).toHaveBeenCalledExactlyOnceWith(f.player);
  f.player.isSneaking = true;
  f.aim.target = { input: "pointer", ray, block: { cell: end, face: "up" } };
  engine.tick++;
  f.use();
  expect(f.onPasted).toHaveBeenCalledExactlyOnceWith(id, engine.tick);
  expect(f.flow()?.kind).toBe("selected");
  engine.tick += BUILD_SPEC.pressDebounceTicks - 1;
  f.use();
  expect(menus.showUtilityMenu).not.toHaveBeenCalled();
  engine.tick += BUILD_SPEC.pressDebounceTicks;
  f.use();
  expect(menus.showUtilityMenu).toHaveBeenCalledExactlyOnceWith(f.player);
});
