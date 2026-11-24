import { type Player, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { expect, it, vi } from "vitest";
import { EditJobs } from "../../../src/application/build/editJobs";
import { PasteAt } from "../../../src/application/build/pasteAt";
import { PressPasteAim } from "../../../src/application/build/pressPasteAim";
import { PressUndo } from "../../../src/application/build/pressUndo";
import { ResolvePasteTarget } from "../../../src/application/build/resolvePasteTarget";
import { RotatePasteAim } from "../../../src/application/build/rotatePasteAim";
import { StepBackSelection } from "../../../src/application/build/stepBackSelection";
import { UndoEdit } from "../../../src/application/build/undoEdit";
import { AIR } from "../../../src/domain/build/blockState";
import { boxOf } from "../../../src/domain/build/box";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/heightFlow";
import { selectionOf } from "../../../src/domain/build/selection";
import { BUILD_SPEC } from "../../../src/domain/build/spec";
import { Debounces } from "../../../src/domain/shared/debounce";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import { registerPasteControls } from "../../../src/infrastructure/build/bedrock/handlers/pasteControls";
import {
  BUILD_UNDO_TYPE,
  PASTE_PLACE_TYPE,
  PASTE_ROTATE_TYPE,
  SELECTION_WAND_TYPE,
  TEST_PRESS_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { DescribeBuild } from "../../../src/infrastructure/build/testHooks/describeBuild";
import { registerTestPress } from "../../../src/infrastructure/build/testHooks/testPress";
import {
  FakeBuildPlayers,
  FakeFeedback,
  FakeGroundProbe,
  FakeSessions,
  FakeWorld,
  nether,
} from "../../application/build/fakes";
import { FakeStructureStore } from "../../application/build/fakes/structureStore";
import { structureClipboard } from "../../support/buildClipboard";

const engine = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown) => void>();
  const event = (name: string) => ({
    subscribe: (fn: (event: unknown) => void) => handlers.set(name, fn),
  });
  return { handlers, event, tick: 0, queue: [] as (() => void)[] };
});
vi.mock("@minecraft/server", () => ({
  ScriptEventSource: { Server: "Server" },
  world: {
    getAllPlayers: vi.fn(),
    afterEvents: { itemUse: engine.event("use") },
    beforeEvents: {
      playerInteractWithBlock: engine.event("interact"),
      playerBreakBlock: engine.event("break"),
    },
  },
  system: {
    afterEvents: { scriptEventReceive: engine.event("script") },
    runTimeout: vi.fn(),
    run: (fn: () => void) => engine.queue.push(fn),
    get currentTick() {
      return engine.tick;
    },
  },
}));

vi.mock("@minecraft/server-ui", () => ({
  ActionFormData: vi.fn(),
  ModalFormData: vi.fn(),
}));

function setup(typeId = PASTE_ROTATE_TYPE, active = true) {
  engine.tick = 0;
  engine.queue.length = 0;
  const feedback = new FakeFeedback();
  const structures = new FakeStructureStore();
  const repo = new FakeSessions(structures);
  const id = asPlayerId("p");
  const session = repo.getOrCreate(id);
  const cell = { x: 0, y: 60, z: 0 };
  if (active)
    session.completeCopy(
      selectionOf(nether, boxOf(cell, cell), AIR),
      structureClipboard(boxOf(cell, cell), undefined, structures),
    );
  structures.calls.length = 0;
  const rotatePasteAim = new RotatePasteAim(repo, feedback);
  const pressPasteAim = new PressPasteAim(
    repo,
    new PasteAt(
      repo,
      new FakeWorld(),
      feedback,
      structures,
      new FakeBuildPlayers(),
    ),
    feedback,
    new ResolvePasteTarget(repo, new FakeGroundProbe()),
  );
  const rotate = vi.spyOn(rotatePasteAim, "execute");
  const place = vi.spyOn(pressPasteAim, "execute");
  const blocks = new FakeWorld();
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  const jobs = new EditJobs(
    repo,
    blocks,
    feedback,
    log,
    new FakeBuildPlayers(),
  );
  const undoEdit = new UndoEdit(repo, feedback, jobs, blocks, structures, log);
  const editUndo = vi.spyOn(undoEdit, "execute");
  const pressUndo = new PressUndo(
    new StepBackSelection(repo, feedback),
    undoEdit,
  );
  const undo = vi.spyOn(pressUndo, "execute");
  const undoDebounce = new Debounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks);
  const refresh = vi.fn();
  const aim = {
    dimensionOf: () => nether,
    aim: vi.fn(() => ({
      input: "pointer" as const,
      ray: { origin: cell, direction: { x: 1, y: 0, z: 0 } },
      block: { cell, face: "up" as const },
    })),
  };
  const rotateDebounce = new Debounces<PlayerId>(
    BUILD_SPEC.rotateDebounceTicks,
  );
  const pasteDebounce = new Debounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks);
  const rotateSelection = { execute: vi.fn(() => "rotated" as const) };
  const pressPasteControl = registerPasteControls({
    repo,
    aim,
    rotatePasteAim,
    rotateSelection,
    pressPasteAim,
    pressUndo,
    undoDebounce,
    rotateDebounce,
    pasteDebounce,
    refresh,
  });
  const player = {
    id,
    isValid: true,
    isSneaking: false,
    dimension: { id: nether },
    selectedSlotIndex: 0,
    heldTypeId: typeId,
    getComponent: () => ({
      container: { getItem: () => ({ typeId: player.heldTypeId }) },
    }),
  };
  const use = (item = typeId) =>
    engine.handlers.get("use")?.({
      source: player,
      itemStack: { typeId: item },
    });
  const interact = (isFirstEvent = true) => {
    const event = {
      player,
      isFirstEvent,
      cancel: false,
      block: { dimension: player.dimension, location: cell },
    };
    engine.handlers.get("interact")?.(event);
    return event;
  };
  return {
    undo,
    editUndo,
    interact,
    pressPasteControl,
    rotateSelection,
    repo,
    session,
    id,
    feedback,
    structures,
    rotate,
    place,
    refresh,
    aim,
    player,
    use,
    rotateDebounce,
    pasteDebounce,
  };
}

function flush() {
  engine.tick += 1;
  for (const fn of engine.queue.splice(0)) fn();
}

it("debounces Paste Rotate across block and item events for the selected box", () => {
  const e = setup();
  const box = boxOf({ x: 0, y: 60, z: 0 }, { x: 4, y: 60, z: 1 });
  e.session.setFlow({
    kind: "selected",
    menuLevel: "root",
    selection: selectionOf(nether, box, AIR),
    from: box.min,
    to: box.max,
  });
  expect(e.interact().cancel).toBe(true);
  flush();
  e.use();
  expect(e.rotateSelection.execute).toHaveBeenCalledExactlyOnceWith({
    playerId: e.id,
    dimensionId: nether,
  });
  expect(e.rotate).not.toHaveBeenCalled();
});

it("rotates the clipboard and immediately refreshes only its owner", () => {
  const e = setup();
  engine.tick = 3;
  e.use();
  expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 1 });
  expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 3);
  expect(e.place).not.toHaveBeenCalled();
  expect(e.structures.calls).toEqual([]);
});

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "shows only the inactive hint for %s without entering build mode",
  (item) => {
    const e = setup(item, false);
    e.repo.remove(e.id);
    e.use();
    expect(e.feedback.messages).toEqual([
      expect.objectContaining({ message: "pasteInactive" }),
    ]);
    expect(e.repo.get(e.id)).toBeUndefined();
    expect(e.refresh).not.toHaveBeenCalled();
    expect(e.structures.calls).toEqual([]);
  },
);

it("immediately refreshes the ghost once when Place resumes aiming", () => {
  const e = setup(PASTE_PLACE_TYPE);
  e.session.startNewCopy();
  engine.tick = 11;
  e.use();
  expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 11, "resumePaste");
  expect(e.structures.calls).toEqual([]);
});

it("places without sneaking using the live aim, dimension and tick", () => {
  const e = setup(PASTE_PLACE_TYPE);
  engine.tick = 11;
  e.use();
  expect(e.place).toHaveBeenCalledExactlyOnceWith({
    playerId: e.id,
    dimensionId: nether,
    aim: e.aim.aim(),
    tick: 11,
    sneaking: false,
    intent: "place",
  });
  expect(e.structures.calls.at(-1)?.kind).toBe("place");
  expect(e.rotate).not.toHaveBeenCalled();
  expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 11);
});

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "debounces held %s attempts including rejected repeats",
  (item) => {
    const e = setup(item);
    const call = item === PASTE_ROTATE_TYPE ? e.rotate : e.place;
    const window =
      item === PASTE_ROTATE_TYPE
        ? BUILD_SPEC.rotateDebounceTicks
        : BUILD_SPEC.pasteRepeatTicks;
    for (engine.tick = 0; engine.tick <= 40; engine.tick += 4) e.use();
    expect(call).toHaveBeenCalledTimes(1);
    engine.tick = 40 + window;
    e.use();
    expect(call).toHaveBeenCalledTimes(2);
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "presses and debounces %s through the returned entry point",
  (typeId) => {
    const e = setup(typeId);
    const press = () =>
      e.pressPasteControl.itemUse(e.player as unknown as Player);
    const call = typeId === PASTE_ROTATE_TYPE ? e.rotate : e.place;
    const window =
      typeId === PASTE_ROTATE_TYPE
        ? BUILD_SPEC.rotateDebounceTicks
        : BUILD_SPEC.pasteRepeatTicks;
    engine.tick = 11;
    press();
    press();
    expect(call).toHaveBeenCalledTimes(1);
    if (typeId === PASTE_ROTATE_TYPE) {
      expect(e.rotate).toHaveBeenCalledWith({ playerId: e.id });
      expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 11);
      expect(e.place).not.toHaveBeenCalled();
    } else {
      expect(e.place).toHaveBeenCalledWith({
        playerId: e.id,
        dimensionId: nether,
        aim: e.aim.aim(),
        tick: 11,
        sneaking: false,
        intent: "place",
      });
      expect(e.rotate).not.toHaveBeenCalled();
      expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 11);
    }
    engine.tick = 11 + window;
    press();
    expect(call).toHaveBeenCalledTimes(2);
  },
);

it("keeps rotate and place windows separate and honors shared wand windows", () => {
  const e = setup();
  e.rotateDebounce.press(e.id, 0);
  e.use();
  expect(e.rotate).not.toHaveBeenCalled();
  e.use(PASTE_PLACE_TYPE);
  expect(e.place).toHaveBeenCalledTimes(1);
  engine.tick = BUILD_SPEC.rotateDebounceTicks;
  e.use();
  expect(e.rotateSelection.execute).toHaveBeenCalledTimes(1);
  expect(e.rotate).not.toHaveBeenCalled();
  e.pasteDebounce.press(e.id, engine.tick);
  e.use(PASTE_PLACE_TYPE);
  expect(e.place).toHaveBeenCalledTimes(1);
});

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "presses %s once from a first block tap without itemUse",
  (item) => {
    const e = setup(item);
    expect(e.interact().cancel).toBe(true);
    expect(e.rotate).not.toHaveBeenCalled();
    expect(e.place).not.toHaveBeenCalled();
    flush();
    if (item === PASTE_ROTATE_TYPE) {
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 1 });
      expect(e.rotate).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
      expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 1);
      expect(e.place).not.toHaveBeenCalled();
      expect(e.structures.calls).toEqual([]);
    } else {
      expect(e.place).toHaveBeenCalledTimes(1);
      expect(e.structures.calls.at(-1)?.kind).toBe("place");
      expect(e.session.flow.kind).toBe("selected");
      expect(e.rotate).not.toHaveBeenCalled();
      expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 1);
    }
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "deduplicates a block tap and itemUse for %s",
  (item) => {
    const e = setup(item);
    e.interact();
    e.use();
    flush();
    expect(
      item === PASTE_ROTATE_TYPE ? e.rotate : e.place,
    ).toHaveBeenCalledTimes(1);
    if (item === PASTE_ROTATE_TYPE)
      expect(e.session.flow).toEqual({ kind: "pasteAim", manualTurn: 1 });
    else
      expect(
        e.structures.calls.filter((call) => call.kind === "place"),
      ).toHaveLength(1);
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "cancels non-first %s block interactions without pressing",
  (item) => {
    const e = setup(item);
    expect(e.interact(false).cancel).toBe(true);
    flush();
    expect(e.rotate).not.toHaveBeenCalled();
    expect(e.place).not.toHaveBeenCalled();
    expect(e.structures.calls).toEqual([]);
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "shows only the inactive hint for a %s block tap before Copy",
  (item) => {
    const e = setup(item, false);
    e.repo.remove(e.id);
    expect(e.interact().cancel).toBe(true);
    flush();
    expect(e.feedback.messages).toEqual([
      expect.objectContaining({ message: "pasteInactive" }),
    ]);
    expect(e.repo.get(e.id)).toBeUndefined();
    expect(e.refresh).not.toHaveBeenCalled();
    expect(e.structures.calls).toEqual([]);
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE, BUILD_UNDO_TYPE])(
  "ignores a scheduled %s tap if the player becomes invalid or changes to a non-control item",
  (item) => {
    for (const change of ["invalid", "wand", "empty"]) {
      const e = setup(item);
      e.interact();
      if (change === "invalid") e.player.isValid = false;
      else e.player.heldTypeId = change === "wand" ? SELECTION_WAND_TYPE : "";
      flush();
      expect(e.rotate).not.toHaveBeenCalled();
      expect(e.place).not.toHaveBeenCalled();
      expect(e.refresh).not.toHaveBeenCalled();
      expect(e.undo).not.toHaveBeenCalled();
      expect(e.structures.calls).toEqual([]);
      expect(e.feedback.messages).toEqual([]);
    }
  },
);

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "cancels %s breaks only in pasteAim",
  (item) => {
    for (const active of [false, true]) {
      const e = setup(item, active);
      const event = { player: e.player, cancel: false };
      engine.handlers.get("break")?.(event);
      expect(event.cancel).toBe(active);
      expect(e.rotate).not.toHaveBeenCalled();
      expect(e.place).not.toHaveBeenCalled();
    }
  },
);

it.each([SELECTION_WAND_TYPE, "minecraft:stick"])(
  "leaves %s events unaffected",
  (item) => {
    const e = setup(item);
    e.use();
    const event = { player: e.player, cancel: false };
    engine.handlers.get("interact")?.(event);
    engine.handlers.get("break")?.(event);
    expect(event.cancel).toBe(false);
    expect(e.rotate).not.toHaveBeenCalled();
    expect(e.place).not.toHaveBeenCalled();
  },
);

it("ignores invalid players", () => {
  const e = setup();
  e.player.isValid = false;
  e.use();
  expect(e.rotate).not.toHaveBeenCalled();
});

it.each([PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE])(
  "shares the returned routes and subscriber debounce for %s",
  (item) => {
    const e = setup(item);
    e.pressPasteControl.blockInteract(e.player as unknown as Player);
    expect(e.rotate).not.toHaveBeenCalled();
    expect(e.place).not.toHaveBeenCalled();
    e.use();
    flush();
    expect(
      item === PASTE_ROTATE_TYPE ? e.rotate : e.place,
    ).toHaveBeenCalledTimes(1);
  },
);

it("undoes once from a first block tap without itemUse or a menu", () => {
  const e = setup(BUILD_UNDO_TYPE);
  expect(e.interact().cancel).toBe(true);
  expect(e.undo).not.toHaveBeenCalled();
  flush();
  expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
  expect(ActionFormData).not.toHaveBeenCalled();
  expect(ModalFormData).not.toHaveBeenCalled();
  expect(e.place).not.toHaveBeenCalled();
  expect(e.rotate).not.toHaveBeenCalled();
});

it.each([false, true])(
  "deduplicates Undo routes (block first: %s)",
  (blockFirst) => {
    const e = setup(BUILD_UNDO_TYPE);
    if (blockFirst) e.interact();
    e.use();
    if (!blockFirst) e.interact();
    flush();
    expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
  },
);

it("debounces repeated Undo itemUse and permits a later press", () => {
  const e = setup(BUILD_UNDO_TYPE);
  for (engine.tick = 0; engine.tick <= 40; engine.tick += 4) e.use();
  expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
  engine.tick = 40 + BUILD_SPEC.pasteRepeatTicks;
  e.use();
  expect(e.undo).toHaveBeenCalledTimes(2);
});

it("cancels non-first Undo block events without pressing", () => {
  const e = setup(BUILD_UNDO_TYPE);
  expect(e.interact(false).cancel).toBe(true);
  flush();
  expect(e.undo).not.toHaveBeenCalled();
});

it.each(["itemUse", "blockInteract"] as const)(
  "reports empty Undo history through %s without creating a session",
  (route) => {
    const e = setup(BUILD_UNDO_TYPE, false);
    e.repo.remove(e.id);
    e.pressPasteControl[route](e.player as unknown as Player);
    flush();
    expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
    expect(e.feedback.messages).toEqual([
      expect.objectContaining({ message: "nothingToUndo" }),
    ]);
    expect(e.repo.get(e.id)).toBeUndefined();
  },
);

it.each(["itemUse", "blockInteract", "blockInteract,itemUse"])(
  "presses held Build Undo through the test hook using %s",
  (routes) => {
    const e = setup(BUILD_UNDO_TYPE);
    vi.mocked(world.getAllPlayers).mockReturnValue([
      e.player as unknown as Player,
    ]);
    registerTestPress(e.pressPasteControl, new DescribeBuild(e.repo), {
      forget: vi.fn(),
      last: () => undefined,
      lastMode: () => undefined,
      hints: () => 0,
    });
    engine.handlers.get("script")?.({
      sourceType: "Server",
      id: TEST_PRESS_EVENT,
      message: `${e.id} ${routes}`,
    });
    flush();
    expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
    expect(e.feedback.messages).toEqual([
      expect.objectContaining({ message: "nothingToUndo" }),
    ]);
  },
);

it("preserves busy feedback and isolates Undo debouncing per player", () => {
  const e = setup(BUILD_UNDO_TYPE);
  e.session.beginEdit();
  e.use();
  expect(e.feedback.messages).toEqual([
    expect.objectContaining({ message: "busy" }),
  ]);
  const other = { ...e.player, id: asPlayerId("other") };
  engine.handlers.get("use")?.({
    source: other,
    itemStack: { typeId: BUILD_UNDO_TYPE },
  });
  expect(e.undo).toHaveBeenCalledTimes(2);
  expect(e.undo).toHaveBeenLastCalledWith({ playerId: other.id });
  expect(e.repo.get(other.id)).toBeUndefined();
});

it.each([false, true])(
  "refreshes the stepped flow once across paired Undo events (block first: %s)",
  (blockFirst) => {
    const e = setup(BUILD_UNDO_TYPE, false);
    const point = tapBlock(
      { kind: "idle" },
      nether,
      { x: 0, y: 60, z: 0 },
      AIR,
    );
    e.session.setFlow(tapAir(point, { x: 4, y: 60, z: 4 }));
    if (blockFirst) e.interact();
    e.use();
    if (!blockFirst) e.interact();
    flush();
    expect(e.undo).toHaveBeenCalledExactlyOnceWith({ playerId: e.id });
    expect(e.session.flow).toBe(point);
    expect(e.editUndo).not.toHaveBeenCalled();
    expect(e.refresh).toHaveBeenCalledExactlyOnceWith(e.id, 0);
  },
);
