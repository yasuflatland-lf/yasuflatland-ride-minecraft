import {
  type BlockPermutation,
  ItemStack,
  type Player,
  type PlayerInteractWithBlockAfterEvent,
  SignSide,
  system,
  world,
} from "@minecraft/server";
import { blockStateOf, sameBlockState } from "../../domain/build/blockState";
import type { Clipboard } from "../../domain/build/clipboard/clipboard";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { Cell } from "../../domain/shared/cells";
import {
  LAID_BLOCK_TAG,
  SELECTION_WAND_TYPE,
  TEST_EDIT_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
} from "../../infrastructure/build/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome, StepSink } from "../outcome";

interface BuildState {
  flow: string;
  clipboardHeld: boolean;
  clipboard?: Clipboard;
  pasteMenu: string[];
  pasteTurn: import("../../domain/build/rotation/quarterTurn").QuarterTurn;
}

interface Reply {
  player: string;
  message?: string;
  count?: number;
  skippedCount?: number;
  offered?: boolean;
  undoHints?: number;
  timedOut?: boolean;
  flow: { kind: string; previous?: number };
  mode?: boolean;
}
function check(ok: boolean, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}

async function withBuilder(
  a: Arena,
  run: (f: Fixture) => Promise<void>,
): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "a connected player is required" };
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return { pass: false, detail: "player inventory missing" };
  const slot = player.selectedSlotIndex;
  const item = inventory.getItem(slot);
  const otherSlot = (slot + 1) % 9;
  const otherItem = inventory.getItem(otherSlot);
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const saved = new Map<
    string,
    { cell: Cell; permutation: BlockPermutation }
  >();
  const responses: (Reply | BuildState)[] = [];
  const listener = (ev: { id: string; message: string }) => {
    if (ev.id !== TEST_RESULT_EVENT) return;
    const reply = JSON.parse(ev.message);
    if (reply.player === player.name) responses.push(reply);
  };
  const query = async <T extends Reply | BuildState = Reply>(
    event: string,
    message: string,
  ): Promise<T> => {
    responses.length = 0;
    system.sendScriptEvent(event, message);
    for (let tick = 0; tick < 220; tick++) {
      await wait(1);
      const response = responses.at(-1);
      if (response) {
        check(
          !("timedOut" in response && response.timedOut),
          `edit timed out: ${message}`,
        );
        return response as T;
      }
    }
    throw new Error(`no response to ${event}: ${message}`);
  };
  const block = (cell: Cell) => {
    const b = a.dim.getBlock(cell);
    if (!b) throw new Error("unreadable build test cell");
    const key = JSON.stringify(cell);
    if (!saved.has(key)) saved.set(key, { cell, permutation: b.permutation });
    return b;
  };
  const origin = a.at(50, a.gy + 8, 50);
  const cell = (x = 0, y = 0, z = 0): Cell => ({
    x: origin.x + x,
    y: origin.y + y,
    z: origin.z + z,
  });
  const tap = (tap: "block" | "air" | "clear", at = cell()) =>
    query(TEST_TAP_EVENT, JSON.stringify({ player: player.name, tap, ...at }));
  const edit = (command: string) =>
    query(TEST_EDIT_EVENT, `${player.id} ${command}`);
  const region = (sx: number, sy: number, sz: number, offset = cell()) => {
    const cells: Cell[] = [];
    for (let x = 0; x < sx; x++)
      for (let y = 0; y < sy; y++)
        for (let z = 0; z < sz; z++)
          cells.push({ x: offset.x + x, y: offset.y + y, z: offset.z + z });
    for (const c of cells) block(c);
    return cells;
  };
  const f = {
    player,
    cell,
    look: (yaw: number) =>
      player.teleport(player.location, { rotation: { x: 25, y: yaw } }),
    block,
    tap,
    edit,
    region,
    state: () => query<BuildState>(TEST_EDIT_EVENT, `${player.id} state`),
    switchItem: async (wand = false) => {
      if (!wand) inventory.setItem(otherSlot, undefined);
      await edit(`slot ${wand ? slot : otherSlot}`);
      await wait(BUILD_SPEC.modeLeaveTicks + 4);
    },
    menu: (menu: string, id: string) => edit(`menu ${menu} ${id}`),
    mode: () => query(TEST_MODE_EVENT, player.name),
    hold: (wand: boolean) =>
      inventory.setItem(
        slot,
        wand ? new ItemStack(SELECTION_WAND_TYPE) : undefined,
      ),
    select: async (end: Cell, air = true) => {
      await tap("clear");
      block(cell()).setType("minecraft:stone");
      await tap("block");
      await tap(air ? "air" : "block", end);
    },
    count: (cells: Cell[], type = "minecraft:stone") =>
      cells.filter((c) => block(c).typeId === type).length,
  };
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    player.teleport(a.at(45, a.gy, 45), { dimension: a.dim });
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    await tap("clear");
    await run(f);
    return { pass: true, detail: "wand flow and world blocks verified" };
  } finally {
    try {
      if (player.isValid) await tap("clear");
    } finally {
      system.afterEvents.scriptEventReceive.unsubscribe(listener);
      for (const { cell, permutation } of saved.values())
        a.dim.getBlock(cell)?.setPermutation(permutation);
      if (player.isValid) {
        inventory.setItem(slot, item);
        inventory.setItem(otherSlot, otherItem);
        player.selectedSlotIndex = slot;
        player.teleport(location, { dimension, rotation });
      }
    }
  }
}
type Fixture = {
  player: Player;
  look(yaw: number): void;
  cell(x?: number, y?: number, z?: number): Cell;
  block(cell: Cell): NonNullable<ReturnType<Arena["dim"]["getBlock"]>>;
  tap(tap: "block" | "air" | "clear", cell?: Cell): Promise<Reply>;
  edit(command: string): Promise<Reply>;
  menu(menu: string, id: string): Promise<Reply>;
  mode(): Promise<Reply>;
  state(): Promise<BuildState>;
  switchItem(wand?: boolean): Promise<void>;
  hold(wand: boolean): void;
  select(end: Cell, air?: boolean): Promise<void>;
  region(sx: number, sy: number, sz: number, offset?: Cell): Cell[];
  count(cells: Cell[], type?: string): number;
};

function snapshot(f: Fixture, cells: Cell[]) {
  return cells.map((c) => {
    const b = f.block(c);
    return blockStateOf(b.typeId, b.permutation.getAllStates());
  });
}
function unchanged(
  f: Fixture,
  cells: Cell[],
  before: ReturnType<typeof snapshot>,
) {
  return snapshot(f, cells).every((state, i) => {
    const old = before[i];
    return old !== undefined && sameBlockState(state, old);
  });
}

export function buildShapes(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [id, sx, sy, sz, expected] of [
      ["fill", 5, 5, 5, 125],
      ["faces", 5, 5, 5, 98],
      ["walls", 5, 5, 5, 80],
      ["frame", 5, 1, 5, 16],
      ["place", 5, 1, 1, 5],
    ] as const) {
      const cells = f.region(5, 5, 5);
      for (const c of cells) {
        const b = f.block(c);
        b.setType("minecraft:oak_log");
        b.setPermutation(b.permutation.withState("pillar_axis", "x"));
      }
      await f.select(f.cell(sx - 1, sy - 1, sz - 1), id !== "fill");
      const before = snapshot(f, cells);
      for (const absent of sy === 5 ? ["frame"] : ["faces", "walls"])
        check(
          (await f.menu("shape", absent)).offered === false,
          `${absent} incorrectly offered for ${id}`,
        );
      const result = await f.menu("shape", id);
      check(
        result.offered === true && result.message === "editDone",
        `${id} did not finish`,
      );
      check(
        f.count(cells) === expected,
        `${id}: expected ${expected} stone blocks, got ${f.count(cells)}`,
      );
      check((await f.menu("utility", "undo")).offered === true, "undo absent");
      check(unchanged(f, cells, before), `${id} undo lost block states`);
    }
  });
}

export function buildRoofs(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [kind, style, expected] of [
      ["gable", "fill", 45],
      ["gable", "hollow", 42],
      ["hip", "fill", 35],
      ["hip", "hollow", 34],
    ] as const) {
      const cells = f.region(5, 4, 5);
      for (const c of cells) f.block(c).setType("minecraft:air");
      await f.select(f.cell(4, 0, 4));
      for (const id of ["fill", "hollow", "cancel"])
        check(
          (await f.menu("contents", id)).offered === false,
          "roof entry offered before roof choice",
        );
      check(
        (await f.menu("shape", kind)).flow.kind === "heightStep",
        "roof height step missing",
      );
      check(
        (await f.edit("height 3")).flow.previous === 3,
        "height not applied",
      );
      const before = snapshot(f, cells);
      const result = await f.menu("contents", style);
      check(
        result.offered === true && result.message === "editDone",
        "roof did not finish",
      );
      check(
        f.count(cells) === expected,
        `${kind} ${style}: expected ${expected}, got ${f.count(cells)}`,
      );
      for (const id of ["fill", "hollow", "cancel"])
        check(
          (await f.menu("contents", id)).offered === false,
          "roof entry offered after confirmation",
        );
      await f.edit("undo");
      check(unchanged(f, cells, before), "roof undo changed original cells");
    }
  });
}

export function buildFlowCancel(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    check(
      (await f.mode()).mode === true,
      "wand did not enter build mode on foot",
    );
    f.block(f.cell()).setType("minecraft:stone");
    check((await f.tap("block")).flow.kind === "point1", "first tap missing");
    f.hold(false);
    await wait(BUILD_SPEC.modeLeaveTicks + 2);
    const left = await f.mode();
    check(
      left.mode === false && left.flow.kind === "idle",
      "item switch did not cancel point1",
    );
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    await f.select(f.cell(4, 0, 4));
    f.hold(false);
    await wait(BUILD_SPEC.modeLeaveTicks + 2);
    check(
      (await f.mode()).flow.kind === "idle",
      "item switch did not cancel endpoint",
    );
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    await f.select(f.cell(4, 0, 4));
    check(
      (await f.menu("shape", "cancel")).flow.kind === "point1",
      "shape Cancel did not resume aiming",
    );
    await f.tap("air", f.cell(4, 0, 4));
    await f.menu("shape", "gable");
    check(
      (await f.menu("contents", "cancel")).flow.kind === "point1",
      "roof Cancel did not resume aiming",
    );
  });
}

export function buildRefusals(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 5, 5);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await f.select(f.cell(100, 10, 100));
    const before = snapshot(f, cells);
    const large = await f.menu("shape", "fill");
    check(
      large.message === "tooLarge" && (large.count ?? 0) > BUILD_SPEC.maxVolume,
      "over-limit fill accepted",
    );
    check(unchanged(f, cells, before), "over-limit fill wrote blocks");
    await f.tap("clear");
    f.block(f.cell()).setType("minecraft:chest");
    const refused = await f.tap("block");
    check(
      refused.message === "materialRefused" && refused.flow.kind === "idle",
      "chest material accepted",
    );
    await f.select(f.cell(4, 4, 4));
    const protectedCell = f.cell(2, 2, 2);
    f.block(protectedCell).setType("yasu_ride:camper_bed");
    check(
      f.block(protectedCell).hasTag(LAID_BLOCK_TAG),
      "fixture lacks laid tag",
    );
    const laid = snapshot(f, [protectedCell]);
    await f.menu("shape", "fill");
    check(
      f.count(cells) === 124 && unchanged(f, [protectedCell], laid),
      "fill changed laid cell or skipped ordinary cells",
    );
    await f.edit("undo");
  });
}

async function startPasteStep(
  f: Fixture,
  {
    height,
  }: {
    height?: number;
  } = {},
): Promise<Reply> {
  let copied = await f.menu("shape", "copy");
  check(copied.offered === true, "Copy absent");
  if (height !== undefined) {
    check(copied.flow.kind === "heightStep", "Copy height step missing");
    check(
      (await f.edit(`height ${height}`)).flow.previous === height,
      "Copy height not applied",
    );
    copied = await f.edit("confirmbox");
  }
  check(
    copied.message === "copied" && copied.flow.kind === "pasteAim",
    "Copy did not enter paste aiming",
  );
  return copied;
}

function pasteStep(
  f: Fixture,
  x: number,
  y: number,
  z: number,
  face: string,
  sneaking = true,
): Promise<Reply> {
  return f.edit(`pasteat ${x} ${y} ${z} ${face} ${sneaking}`);
}

async function endPasteStep(f: Fixture): Promise<void> {
  const ended = await f.menu("paste", "endPaste");
  check(
    ended.offered === true && ended.flow.kind === "idle",
    "End pasting failed",
  );
  check(
    (await f.menu("paste", "endPaste")).offered === false,
    "End pasting offered while idle",
  );
  const target = pasteTarget(f, f.cell(12, 0, 12), 1, 1, 1);
  await pasteStep(f, target.anchor.x, target.anchor.y, target.anchor.z, "up");
  await checkState(f, "idle", false);
  check(
    unchanged(f, target.cells, target.before),
    "Paste wrote blocks after End pasting",
  );
}

async function checkState(
  f: Fixture,
  flow: string,
  clipboardHeld: boolean,
): Promise<BuildState> {
  const state = await f.state();
  check(state.flow === flow, `expected ${flow}, got ${state.flow}`);
  check(
    state.clipboardHeld === clipboardHeld,
    `expected clipboard presence ${clipboardHeld}`,
  );
  return state;
}

async function copyLine(f: Fixture): Promise<void> {
  f.region(2, 1, 1);
  await f.select(f.cell(1));
  f.block(f.cell(1)).setType("minecraft:oak_log");
  await f.menu("shape", "copy");
  await checkState(f, "pasteAim", true);
}

async function pasteInto(
  f: Fixture,
  target: ReturnType<typeof pasteTarget>,
): Promise<void> {
  await pasteStep(f, target.anchor.x, target.anchor.y, target.anchor.z, "up");
}

export function buildCopyEntersPasteAim(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const expected = snapshot(f, f.region(2, 1, 1));
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await pasteInto(f, target);
    await checkState(f, "pasteAim", true);
    check(
      unchanged(f, target.cells, expected),
      "Copy did not allow immediate Paste",
    );
    await f.menu("paste", "undo");
  });
}

export function buildPasteMenu(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (let i = 0; i < BUILD_SPEC.undoDepth; i++) {
      if (!(await f.state()).pasteMenu.includes("undo")) break;
      await f.edit("undo");
    }
    await copyLine(f);
    const withoutHistory = await checkState(f, "pasteAim", true);
    check(
      withoutHistory.pasteMenu.join() === "newCopy,endPaste,cancel",
      "Paste menu without history has unexpected entries",
    );
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await pasteStep(
      f,
      target.anchor.x,
      target.anchor.y,
      target.anchor.z,
      "up",
      false,
    );
    check(
      unchanged(f, target.cells, target.before),
      "Plain press pasted instead of opening the menu",
    );
    await f.menu("paste", "cancel");
    await checkState(f, "pasteAim", true);
    await pasteInto(f, target);
    const withHistory = await checkState(f, "pasteAim", true);
    check(
      withHistory.pasteMenu.join() === "undo,newCopy,endPaste,cancel",
      "Paste menu with history must have exactly four ordered entries",
    );
    await f.menu("paste", "undo");
    check(
      unchanged(f, target.cells, target.before),
      "menu Undo did not restore blocks",
    );
    check(
      (await f.state()).pasteMenu.join() === "newCopy,endPaste,cancel",
      "Undo remained in the menu without history",
    );
  });
}

export function buildEndPastingDiscards(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await f.menu("paste", "endPaste");
    await checkState(f, "idle", false);
    await pasteInto(f, target);
    await checkState(f, "idle", false);
    check(
      unchanged(f, target.cells, target.before),
      "Paste wrote blocks after End pasting",
    );
  });
}

export function buildNewCopyReplaces(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    await f.menu("paste", "newCopy");
    await checkState(f, "idle", true);
    const source = f.region(2, 2, 2);
    for (const cell of source) f.block(cell).setType("minecraft:gold_block");
    await f.tap("block");
    await checkState(f, "point1", true);
    await f.tap("air", f.cell(1, 0, 1));
    await checkState(f, "endpoint", true);
    await f.menu("shape", "copy");
    await checkState(f, "heightStep", true);
    await f.edit("height 2");
    const expected = snapshot(f, source);
    await f.edit("confirmbox");
    await checkState(f, "pasteAim", true);
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 2, 2);
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "New copy did not replace the clipboard",
    );
    await f.menu("paste", "undo");
  });
}

export function buildPasteItemSwitch(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await f.switchItem();
    await checkState(f, "idle", false);
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, target.before),
      "Paste wrote blocks after item switch",
    );
  });
}

export function buildNewCopyItemSwitch(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const selecting of [false, true]) {
      await copyLine(f);
      await f.menu("paste", "newCopy");
      await checkState(f, "idle", true);
      if (selecting) {
        await f.tap("block");
        await checkState(f, "point1", true);
      }
      await f.switchItem();
      await checkState(f, "idle", false);
      const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
      await pasteInto(f, target);
      check(
        unchanged(f, target.cells, target.before),
        "New copy item switch kept a usable clipboard",
      );
      await f.switchItem(true);
    }
  });
}

export function buildPasteUndoRepeat(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const expected = snapshot(f, f.region(2, 1, 1));
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    // Two cells finish in one edit tick, keeping Undo and re-paste inside
    // pasteRepeatTicks without a wait or state query between them.
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "first Paste did not write blocks",
    );
    await f.menu("paste", "undo");
    check(
      unchanged(f, target.cells, target.before),
      "Undo did not restore blocks",
    );
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "same-anchor re-paste was suppressed after Undo",
    );
    await checkState(f, "pasteAim", true);
    await f.menu("paste", "undo");
  });
}

export function buildAimedPaste(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(3, 1, 1);
    for (const c of source) f.block(c).setType("minecraft:air");
    await f.select(f.cell(2));
    await f.menu("shape", "place");
    f.block(f.cell(1)).setType("minecraft:air");
    f.block(f.cell(2)).setType("minecraft:oak_log");
    const log = f.block(f.cell(2));
    log.setPermutation(log.permutation.withState("pillar_axis", "z"));
    for (const [face, dx, dy, dz] of [
      ["up", 0, 1, 0],
      ["down", 0, -1, 0],
      ["east", 1, 0, 0],
      ["west", -1, 0, 0],
      ["north", 0, 0, -1],
      ["south", 0, 0, 1],
    ] as const) {
      await f.select(f.cell(2));
      await startPasteStep(f);
      const anchor = f.cell(10, 2, 10);
      f.block(anchor).setType("minecraft:gold_block");
      const target = f.region(3, 1, 1, {
        x: anchor.x + dx,
        y: anchor.y + dy,
        z: anchor.z + dz,
      });
      for (const c of target) f.block(c).setType("minecraft:gold_block");
      const before = snapshot(f, target);
      await pasteStep(f, anchor.x, anchor.y, anchor.z, face, false);
      check(unchanged(f, target, before), "Plain aimed press wrote blocks");
      const pasted = await pasteStep(
        f,
        anchor.x,
        anchor.y,
        anchor.z,
        face,
        true,
      );
      check(pasted.message === "editDone", "aimed paste failed");
      const actual = snapshot(f, target);
      check(
        actual[0]?.typeId === "minecraft:stone" &&
          actual[1]?.typeId === "minecraft:air" &&
          actual[2]?.typeId === "minecraft:oak_log" &&
          actual[2]?.states.pillar_axis === "z",
        `paste anchor/states wrong for ${face}`,
      );
      await f.edit("undo");
      check(
        unchanged(f, target, before),
        "paste undo did not restore destination",
      );
      await endPasteStep(f);
    }
    await f.edit("undo");
  });
}

function mixedSource(f: Fixture, cells: Cell[]): void {
  cells.forEach((cell, i) => {
    const block = f.block(cell);
    block.setType(
      ["minecraft:stone", "minecraft:oak_log", "minecraft:air"][i % 3] ??
        "minecraft:stone",
    );
    if (block.typeId === "minecraft:oak_log")
      block.setPermutation(block.permutation.withState("pillar_axis", "x"));
  });
}

function pasteTarget(
  f: Fixture,
  anchor: Cell,
  sx: number,
  sy: number,
  sz: number,
) {
  f.block(anchor).setType("minecraft:gold_block");
  const cells = f.region(sx, sy, sz, { ...anchor, y: anchor.y + 1 });
  for (const cell of cells) f.block(cell).setType("minecraft:gold_block");
  return { anchor, cells, before: snapshot(f, cells) };
}

export function buildCopyShapes(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [sy, sz, heightStep] of [
      [3, 3, false],
      [3, 1, false],
      [3, 3, true],
    ] as const) {
      const source = f.region(3, sy, sz);
      mixedSource(f, source);
      await f.select(f.cell(2, heightStep ? 0 : sy - 1, sz - 1));
      // Kept blocks and air both count toward the inclusive box volume.
      f.block(f.cell(1)).setType("minecraft:chest");
      const copied = await startPasteStep(f, {
        height: heightStep ? 3 : undefined,
      });
      check(copied.count === source.length, "Copy count wrong");
      const clipboard = (await f.state()).clipboard;
      check(
        clipboard?.contents.kind === "structure" &&
          clipboard.size.x === 3 &&
          clipboard.size.y === sy &&
          clipboard.size.z === sz,
        "Copy clipboard size or kind wrong",
      );
      await f.menu("paste", "endPaste");
      await checkState(f, "idle", false);
    }
  });
}

export function buildCopyStructure(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(4, 3, 3);
    try {
      for (const cell of cells) f.block(cell).setType("minecraft:air");
      for (const cell of f.region(4, 1, 3))
        f.block(cell).setType("minecraft:stone");
      await f.select(f.cell(3, 2, 2));
      const chest = f.block(f.cell(1, 1, 1));
      chest.setType("minecraft:chest");
      const inventory = chest.getComponent("minecraft:inventory")?.container;
      check(inventory !== undefined, "Chest inventory missing");
      inventory.setItem(0, new ItemStack("minecraft:diamond", 7));
      const signBlock = f.block(f.cell(2, 1, 1));
      signBlock.setType("minecraft:standing_sign");
      const sign = signBlock.getComponent("minecraft:sign");
      check(sign !== undefined, "Sign component missing");
      sign.setText("Copy front", SignSide.Front);
      sign.setText("Copy back", SignSide.Back);
      // The frame stays empty: whether a populated frame survives is the
      // player-gated build_structure_store_decor's question (ADR 0244).
      f.block(f.cell(0, 1, 1)).setType("minecraft:frame");
      const copied = await startPasteStep(f);
      check(
        copied.count === cells.length,
        "Copy did not report the box volume",
      );
      const clipboard = (await f.state()).clipboard;
      check(
        clipboard?.contents.kind === "structure",
        "Copy did not save a structure",
      );
      check(
        clipboard.size.x === 4 &&
          clipboard.size.y === 3 &&
          clipboard.size.z === 3 &&
          clipboard.blockCount === cells.length,
        "Structure clipboard dimensions or count wrong",
      );
    } finally {
      try {
        await f.menu("paste", "endPaste");
      } finally {
        // Clear inventories before removing their blocks so fixture items cannot drop.
        for (const cell of cells)
          f.block(cell)
            .getComponent("minecraft:inventory")
            ?.container?.clearAll();
        for (const cell of cells) f.block(cell).setType("minecraft:air");
      }
    }
  });
}

// A frame with no supporting block pops off on the next neighbor update, which
// a structure place triggers, so fixtures put one stone behind it.
function placeSupportedFrame(f: Fixture, c: Cell): void {
  f.block({ ...c, x: c.x - 1 }).setType("minecraft:stone");
  const frame = f.block(c);
  frame.setType("minecraft:frame");
  frame.setPermutation(frame.permutation.withState("facing_direction", 5));
}

export function buildContinuousPaste(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(2, 2, 2);
    mixedSource(f, source);
    await f.select(f.cell(1, 1, 1));
    const expected = snapshot(f, source);
    await startPasteStep(f);
    const targets = [20, 24, 28].map((x) =>
      pasteTarget(f, f.cell(x, 0, 12), 2, 2, 2),
    );
    for (const target of targets) {
      const pasted = await pasteStep(
        f,
        target.anchor.x,
        target.anchor.y,
        target.anchor.z,
        "up",
      );
      check(
        pasted.message === "editDone" && pasted.flow.kind === "pasteAim",
        "Paste did not continue",
      );
      check(
        unchanged(f, target.cells, expected),
        "continuous Paste lost source states",
      );
    }
    const last = targets[targets.length - 1];
    if (!last) throw new Error("no paste targets");
    const undone = await f.menu("paste", "undo");
    check(
      undone.offered === true &&
        undone.message === "undoDone" &&
        undone.flow.kind === "pasteAim",
      `Undo unavailable while pasting: ${undone.offered} ${undone.message} ${undone.flow.kind}`,
    );
    check(
      unchanged(f, last.cells, last.before),
      "continuous Paste undo lost destination states",
    );
    for (const target of targets.slice(0, -1))
      check(
        unchanged(f, target.cells, expected),
        "earlier continuous Paste changed after Undo",
      );
    await endPasteStep(f);
    await f.select(f.cell(1, 1, 1));
    await startPasteStep(f);
    f.hold(false);
    await wait(BUILD_SPEC.modeLeaveTicks + 2);
    check(
      (await f.mode()).flow.kind !== "pasteAim",
      "item switch did not end Paste",
    );
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
  });
}

export function buildPasteBlocked(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(2, 2, 2);
    mixedSource(f, source);
    await f.select(f.cell(1, 1, 1));
    const expected = snapshot(f, source);
    await startPasteStep(f);
    const blocked = pasteTarget(f, f.cell(12, 0, 24), 2, 2, 2);
    const protectedCell = f.cell(13, 2, 25);
    f.block(protectedCell).setType("yasu_ride:camper_bed");
    check(
      f.block(protectedCell).hasTag(LAID_BLOCK_TAG),
      "fixture lacks laid tag",
    );
    const before = snapshot(f, blocked.cells);
    const clean = pasteTarget(f, f.cell(18, 0, 24), 2, 2, 2);
    const refused = await pasteStep(
      f,
      blocked.anchor.x,
      blocked.anchor.y,
      blocked.anchor.z,
      "up",
    );
    check(
      refused.message === "pasteBlocked" && refused.flow.kind === "pasteAim",
      "blocked Paste did not retain aiming",
    );
    check(
      unchanged(f, blocked.cells, before),
      "blocked Paste changed destination",
    );
    const pasted = await pasteStep(
      f,
      clean.anchor.x,
      clean.anchor.y,
      clean.anchor.z,
      "up",
    );
    check(
      pasted.message === "editDone" && pasted.flow.kind === "pasteAim",
      "clean Paste after refusal failed",
    );
    check(
      unchanged(f, clean.cells, expected),
      "clean Paste lost source states",
    );
    await f.menu("paste", "undo");
    check(
      unchanged(f, clean.cells, clean.before),
      "clean Paste undo lost destination states",
    );
    await endPasteStep(f);
  });
}

async function placeSolid(
  f: Fixture,
  end: Cell,
  shape: string,
  fill: string,
  height?: number,
): Promise<void> {
  await f.select(end);
  f.block(f.cell()).setType("minecraft:air");
  const step = await f.menu("shape", shape);
  check(step.flow.kind === "heightStep", `${shape} height step missing`);
  if (height !== undefined)
    check(
      (await f.edit(`height ${height}`)).flow.previous === height,
      "height not applied",
    );
  const done = await f.menu("contents", fill);
  check(
    done.offered === true && done.message === "editDone",
    `${shape} ${fill} did not finish`,
  );
}

export function buildCylinderRect(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(7, 4, 7);
    for (const [fill, expected] of [
      ["fill", 148],
      ["hollow", 106],
      ["tube", 64],
    ] as const) {
      for (const c of cells) f.block(c).setType("minecraft:air");
      await placeSolid(f, f.cell(6, 0, 6), "cylinder", fill, 4);
      check(
        f.count(cells) === expected,
        `cylinder ${fill}: expected ${expected}, got ${f.count(cells)}`,
      );
      const stone = (x: number, y: number, z: number) =>
        f.block(f.cell(x, y, z)).typeId === "minecraft:stone";
      check(stone(0, 1, 3) && stone(6, 2, 3), `cylinder ${fill} wall missing`);
      check(!stone(0, 1, 0), `cylinder ${fill} filled a corner`);
      const centers = [0, 1, 2, 3].map((y) => stone(3, y, 3));
      const wanted =
        fill === "fill"
          ? [true, true, true, true]
          : fill === "hollow"
            ? [true, false, false, true]
            : [false, false, false, false];
      check(
        centers.every((v, i) => v === wanted[i]),
        `cylinder ${fill} inside layers wrong: ${centers.join()}`,
      );
      await f.edit("undo");
      check(f.count(cells) === 0, `cylinder ${fill} undo left blocks`);
    }
  });
}

export function buildCylinderBox(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 5, 5);
    for (const [fill, expected] of [
      ["fill", 105],
      ["hollow", 78],
      ["tube", 60],
    ] as const) {
      for (const c of cells) f.block(c).setType("minecraft:air");
      await f.select(f.cell(4, 4, 4));
      f.block(f.cell()).setType("minecraft:air");
      const step = await f.menu("shape", "cylinder");
      check(
        step.flow.kind === "heightStep" && step.flow.previous === 5,
        "box cylinder did not lock the height to the box",
      );
      check(
        (await f.edit("height 2")).flow.previous === 5,
        "locked cylinder height changed",
      );
      const done = await f.menu("contents", fill);
      check(done.message === "editDone", `box cylinder ${fill} failed`);
      check(
        f.count(cells) === expected,
        `box cylinder ${fill}: expected ${expected}, got ${f.count(cells)}`,
      );
      await f.edit("undo");
    }
  });
}

export function buildSphereBox(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [size, end, counts] of [
      [[5, 5, 5], f.cell(4, 4, 4), { fill: 81, hollow: 54 }],
      [[5, 3, 7], f.cell(4, 2, 6), { fill: 61, hollow: 46 }],
    ] as const) {
      const cells = f.region(size[0], size[1], size[2]);
      for (const fill of ["fill", "hollow"] as const) {
        for (const c of cells) f.block(c).setType("minecraft:air");
        await f.select(end);
        f.block(f.cell()).setType("minecraft:air");
        const step = await f.menu("shape", "sphere");
        check(
          step.flow.kind === "heightStep" && step.flow.previous === size[1],
          "box sphere did not lock the height to the box",
        );
        check(
          (await f.edit("height 2")).flow.previous === size[1],
          "locked sphere height changed",
        );
        const done = await f.menu("contents", fill);
        check(done.message === "editDone", `box sphere ${fill} failed`);
        check(
          f.count(cells) === counts[fill],
          `box sphere ${fill}: expected ${counts[fill]}, got ${f.count(cells)}`,
        );
        await f.edit("undo");
        check(f.count(cells) === 0, `box sphere ${fill} undo left blocks`);
      }
    }
  });
}

export function buildSphereRect(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 5, 5);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await placeSolid(f, f.cell(4, 0, 4), "sphere", "fill", 5);
    check(
      f.count(cells) === 81,
      `rect sphere: expected 81, got ${f.count(cells)}`,
    );
    await f.edit("undo");
    check(f.count(cells) === 0, "rect sphere undo left blocks");
    for (const end of [f.cell(4), f.cell(4, 4)]) {
      await f.select(end);
      check(
        (await f.menu("shape", "sphere")).offered === false,
        "sphere offered on a line or vertical rectangle",
      );
    }
  });
}

export function buildSphereHollow(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(7, 7, 7);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await f.select(f.cell(6, 6, 6));
    f.block(f.cell()).setType("minecraft:air");
    await f.menu("shape", "sphere");
    check(
      (await f.menu("contents", "tube")).offered === false,
      "tube offered on a sphere",
    );
    await f.menu("contents", "hollow");
    check(
      f.count(cells) === 98,
      `hollow sphere: expected 98, got ${f.count(cells)}`,
    );
    const stone = (x: number, y: number, z: number) =>
      f.block(f.cell(x, y, z)).typeId === "minecraft:stone";
    check(
      stone(0, 3, 3) && stone(6, 3, 3) && stone(3, 0, 3) && stone(3, 6, 3),
      "hollow sphere misses an end of the x or y axis",
    );
    check(stone(3, 3, 0) && stone(3, 3, 6), "hollow sphere misses a z end");
    check(!stone(3, 3, 3) && !stone(2, 3, 3), "hollow sphere is not empty");
    await f.edit("undo");
    check(f.count(cells) === 0, "hollow sphere undo left blocks");
  });
}

export function buildCubeRect(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(4, 3, 4);
    for (const [fill, expected] of [
      ["fill", 48],
      ["hollow", 44],
      ["tube", 36],
    ] as const) {
      for (const c of cells) f.block(c).setType("minecraft:air");
      await placeSolid(f, f.cell(3, 0, 3), "cube", fill, 3);
      check(
        f.count(cells) === expected,
        `cube ${fill}: expected ${expected}, got ${f.count(cells)}`,
      );
      await f.edit("undo");
      check(f.count(cells) === 0, `cube ${fill} undo left blocks`);
    }
    await f.select(f.cell(3, 3, 3));
    check(
      (await f.menu("shape", "cube")).offered === false,
      "cube offered on a box",
    );
  });
}

export function buildSolidCancelUndo(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 3, 5);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await f.select(f.cell(4, 0, 4));
    f.block(f.cell()).setType("minecraft:air");
    for (const shape of ["cylinder", "cube"]) {
      check(
        (await f.menu("shape", shape)).flow.kind === "heightStep",
        `${shape} height step missing`,
      );
      check(
        (await f.menu("contents", "cancel")).flow.kind === "point1",
        `${shape} Cancel did not return to end-point selection`,
      );
      await f.tap("air", f.cell(4, 0, 4));
    }
    f.block(f.cell()).setType("minecraft:air");
    await f.menu("shape", "cylinder");
    await f.edit("height 3");
    await f.menu("contents", "fill");
    check(f.count(cells) > 0, "cylinder was not built");
    check((await f.menu("utility", "undo")).offered === true, "undo absent");
    check(f.count(cells) === 0, "undo did not remove the cylinder");
  });
}

export function buildCutShapes(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [sx, sy, sz] of [
      [5, 1, 1],
      [3, 3, 1],
      [3, 3, 3],
    ] as const) {
      const cells = f.region(sx, sy, sz);
      for (const cell of cells) f.block(cell).setType("minecraft:stone");
      await f.select(f.cell(sx - 1, sy - 1, sz - 1));
      const before = snapshot(f, cells);
      const cut = await f.menu("shape", "cut");
      check(
        cut.offered === true &&
          cut.message === "editDone" &&
          cut.flow.kind === "pasteAim",
        "Cut did not finish",
      );
      check(
        f.count(cells, "minecraft:air") === cells.length,
        "Cut left selected cells",
      );
      await undoCut(f, cells.length);
      check(unchanged(f, cells, before), "Cut Undo lost blocks");
      await f.menu("paste", "endPaste");
    }
  });
}

export function buildCutHeight(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const surround = f.region(5, 5, 5, f.cell(-1, -1, -1));
    for (const cell of surround) f.block(cell).setType("minecraft:stone");
    const cells = f.region(3, 3, 3);
    const outside = surround.filter(
      (c) => !cells.some((s) => s.x === c.x && s.y === c.y && s.z === c.z),
    );
    const before = snapshot(f, outside);
    await f.select(f.cell(2, 0, 2));
    check(
      (await f.menu("shape", "cut")).flow.kind === "heightStep",
      "Cut height step missing",
    );
    check(
      (await f.edit("height 3")).flow.previous === 3,
      "Cut height not applied",
    );
    check(f.count(cells) === cells.length, "Cut wrote before confirmation");
    check(
      (await f.edit("confirmbox")).message === "editDone",
      "Height Cut did not finish",
    );
    check(
      f.count(cells, "minecraft:air") === cells.length,
      "Cut height layers wrong",
    );
    check(
      unchanged(f, outside, before),
      "Cut changed cells outside height box",
    );
    await undoCut(f, cells.length);
    check(unchanged(f, outside, before), "Cut Undo changed outside cells");
    await f.menu("paste", "endPaste");
  });
}

export function buildCutUndo(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 3, 3);
    mixedSource(f, cells);
    await f.select(f.cell(2, 2, 2));
    const before = snapshot(f, cells);
    check(
      (await f.menu("shape", "cut")).message === "editDone",
      "Mixed Cut failed",
    );
    check(
      f.count(cells, "minecraft:air") === cells.length,
      "Mixed Cut left blocks",
    );
    await undoCut(f, cells.length);
    check(unchanged(f, cells, before), "Cut Undo lost exact block states");
    await f.menu("paste", "endPaste");
  });
}

export function buildUndoConflict(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 3, 3);
    for (const cell of cells) f.block(cell).setType("minecraft:gold_block");
    await f.select(f.cell(2, 2, 2));
    f.block(f.cell()).setType("minecraft:gold_block");
    check(
      (await f.menu("shape", "fill")).count === cells.length,
      "Fill count wrong",
    );
    const conflict = f.cell(1, 1, 1);
    const reverted = f.cell(2, 1, 1);
    f.block(conflict).setType("minecraft:diamond_block");
    f.block(reverted).setType("minecraft:gold_block");
    const undo = await f.menu("utility", "undo");
    check(
      undo.message === "undoDonePartial" &&
        undo.count === cells.length - 2 &&
        undo.skippedCount === 1,
      "Partial Undo counts wrong",
    );
    check(
      f.block(conflict).typeId === "minecraft:diamond_block",
      "Undo overwrote a later edit",
    );
    check(
      f.count(cells, "minecraft:gold_block") === cells.length - 1,
      "Undo did not restore the other cells",
    );
  });
}

export function buildCutKeepsProtected(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 3, 3);
    for (const cell of cells) f.block(cell).setType("minecraft:stone");
    await f.select(f.cell(2, 2, 2));
    const protectedBlock = f.block(f.cell(1, 1, 1));
    protectedBlock.setType("yasu_ride:camper_bed");
    check(protectedBlock.hasTag(LAID_BLOCK_TAG), "fixture lacks laid tag");
    const before = snapshot(f, cells);
    const cut = await f.menu("shape", "cut");
    check(cut.message === "pasteBlocked", "Protected cut was accepted");
    check(unchanged(f, cells, before), "Refused cut changed blocks");
  });
}

async function undoCut(f: Fixture, volume: number): Promise<void> {
  const undo = await f.menu("paste", "undo");
  check(
    undo.message === "undoDone" && undo.count === volume,
    `Cut Undo reported ${undo.message} ${undo.count}`,
  );
}

async function pasteCutClipboard(
  f: Fixture,
  anchor: Cell,
  volume: number,
): Promise<void> {
  const pasted = await pasteStep(f, anchor.x, anchor.y - 1, anchor.z, "up");
  check(
    pasted.message === "editDone" && pasted.count === volume,
    `Cut clipboard paste reported ${pasted.message} ${pasted.count}`,
  );
}

export function buildCutStructure(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(8, 4, 8);
    const target = f.region(8, 4, 8, f.cell(12));
    const entities = () =>
      a.dim.getEntities().filter((e) => {
        const p = e.location;
        return (
          e.typeId !== "minecraft:player" &&
          [f.cell(), f.cell(12)].some(
            (min) =>
              p.x >= min.x &&
              p.x < min.x + 8 &&
              p.y >= min.y - 2 &&
              p.y < min.y + 4 &&
              p.z >= min.z &&
              p.z < min.z + 8,
          )
        );
      });
    try {
      for (const cell of [...source, ...target])
        f.block(cell).setType("minecraft:air");
      for (const cell of f.region(8, 1, 8))
        f.block(cell).setType("minecraft:stone");
      await f.select(f.cell(7, 3, 7));
      const chest = f.block(f.cell(1, 1, 1));
      chest.setType("minecraft:chest");
      const inventory = chest.getComponent("minecraft:inventory")?.container;
      check(inventory !== undefined, "Chest inventory missing");
      inventory.setItem(0, new ItemStack("minecraft:diamond", 7));
      const signBlock = f.block(f.cell(3, 1, 1));
      signBlock.setType("minecraft:standing_sign");
      const sign = signBlock.getComponent("minecraft:sign");
      check(sign !== undefined, "Sign component missing");
      sign.setText("Cut front", SignSide.Front);
      sign.setText("Cut back", SignSide.Back);
      placeSupportedFrame(f, f.cell(5, 1, 1));
      const cowAt = f.cell(4, 1, 5);
      a.dim.runCommand(
        `summon minecraft:cow ${cowAt.x + 0.5} ${cowAt.y} ${cowAt.z + 0.5}`,
      );
      check(
        entities().some((e) => e.typeId === "minecraft:cow"),
        "Cow fixture missing",
      );
      check(
        (await f.menu("shape", "cut")).message === "editDone",
        "Structure cut failed",
      );
      await wait(5);
      check(
        source.every((c) => f.block(c).isAir),
        "Cut left source blocks or frame",
      );
      check(entities().length === 0, "Cut left entities or dropped items");
      await pasteCutClipboard(f, f.cell(12), source.length);
      await wait(2);
      const restored = f
        .block(f.cell(13, 1, 1))
        .getComponent("minecraft:inventory")
        ?.container?.getItem(0);
      check(
        restored?.typeId === "minecraft:diamond" && restored.amount === 7,
        "Chest contents lost",
      );
      const restoredSign = f
        .block(f.cell(15, 1, 1))
        .getComponent("minecraft:sign");
      check(
        restoredSign?.getText(SignSide.Front) === "Cut front" &&
          restoredSign.getText(SignSide.Back) === "Cut back",
        "Sign text lost",
      );
      check(
        f.block(f.cell(17, 1, 1)).typeId === "minecraft:frame",
        "Frame lost",
      );
      check(
        entities().filter((e) => e.typeId === "minecraft:cow").length === 1,
        "Animal lost or duplicated",
      );
      check(
        source.every((c) => f.block(c).isAir),
        "Placement changed source",
      );
    } finally {
      for (const entity of entities()) entity.remove();
      for (const cell of [...source, ...target])
        f.block(cell).setType("minecraft:air");
      await f.menu("paste", "endPaste");
    }
  });
}

/** Footprint columns from a layer below the fixture's origin up to the world top. */
function columnRegion(f: Fixture, sx: number, sz: number, bottom: number) {
  const offset = f.cell(0, bottom, 0);
  return f.region(sx, BUILD_SPEC.worldTopY - offset.y + 1, sz, offset);
}

export function buildRemoveAbove(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = columnRegion(f, 3, 3, -3);
    for (const cell of cells) f.block(cell).setType("minecraft:air");
    const ceiling = f.block({ ...f.cell(1, 0, 1), y: BUILD_SPEC.worldTopY });
    const floor = f.region(3, 1, 3, f.cell(0, -3, 0));
    for (const cell of floor) f.block(cell).setType("minecraft:stone");
    const below = f.block(f.cell(1, -4, 1));
    const beside = f.block(f.cell(3, 2, 1));
    below.setType("minecraft:stone");
    beside.setType("minecraft:stone");
    // The first point sits above the end point, so the end point's layer is the floor.
    await f.select(f.cell(2, -3, 2));
    const firstPoint = f.block(f.cell());
    const raised = f.block(f.cell(2, 2, 2));
    raised.setType("minecraft:stone");
    ceiling.setType("minecraft:stone");
    const chest = f.block(f.cell(1, 1, 1));
    chest.setType("minecraft:chest");
    const inventory = chest.getComponent("minecraft:inventory")?.container;
    check(inventory !== undefined, "Chest inventory missing");
    inventory.setItem(0, new ItemStack("minecraft:diamond", 7));
    try {
      const chosen = await f.menu("shape", "removeAbove");
      check(
        chosen.offered === true && chosen.flow.kind === "terrainConfirm",
        "Remove above did not ask for confirmation",
      );
      check(f.count([f.cell(2, 2, 2)]) === 1, "Wrote before confirmation");
      const done = await f.menu("terrain", "confirm");
      check(
        done.message === "editDoneCount" && done.flow.kind === "idle",
        `Remove above did not finish: ${done.message}`,
      );
      check(done.count === 3, `Changed-cell count wrong: ${done.count}`);
      check(f.count(floor) === floor.length, "Remove above changed the floor");
      check(
        firstPoint.typeId === "minecraft:air" &&
          raised.typeId === "minecraft:air" &&
          ceiling.typeId === "minecraft:air",
        "Remove above left a block over the floor",
      );
      check(
        chest.typeId === "minecraft:chest" &&
          chest.getComponent("minecraft:inventory")?.container?.getItem(0)
            ?.amount === 7,
        "Remove above changed the chest",
      );
      check(
        below.typeId === "minecraft:stone" &&
          beside.typeId === "minecraft:stone",
        "Remove above wrote outside its columns",
      );
    } finally {
      chest.getComponent("minecraft:inventory")?.container?.clearAll();
    }
  });
}

export function buildRemoveAboveTooLarge(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const side = BUILD_SPEC.maxTerrainSide;
    const cells = f.region(1, 2, 1, f.cell(0, 1, 0));
    for (const cell of cells) f.block(cell).setType("minecraft:stone");
    await f.select(f.cell(side, 0, 0));
    const before = snapshot(f, cells);
    const refused = await f.menu("shape", "removeAbove");
    check(
      refused.message === "tooLarge" && refused.flow.kind === "endpoint",
      "Over-limit Remove above was accepted",
    );
    check(unchanged(f, cells, before), "Over-limit Remove above wrote blocks");
    await f.select(f.cell(side - 1, 0, side - 1));
    const accepted = await f.menu("shape", "removeAbove");
    check(
      accepted.flow.kind === "terrainConfirm",
      "Remove above refused a footprint at the limit",
    );
    await f.menu("terrain", "cancel");
    check(unchanged(f, cells, before), "Cancel wrote blocks");
  });
}

export function buildRemoveAboveNoUndo(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    const columns = columnRegion(f, 3, 1, -1);
    for (const cell of columns) f.block(cell).setType("minecraft:air");
    const line = f.region(6, 1, 1);
    await f.select(f.cell(5));
    // The select helper places the first corner itself, so place the blocks afterwards.
    for (const cell of line) f.block(cell).setType("minecraft:dirt");
    check(
      (await f.menu("shape", "place")).message === "editDone",
      "Earlier edit did not finish",
    );
    check(f.count(line) === line.length, "Earlier edit left dirt behind");
    await f.select(f.cell(2, -1, 0));
    await f.menu("shape", "removeAbove");
    const removed = await f.menu("terrain", "confirm");
    check(
      removed.message === "editDoneCount" && removed.count === 3,
      `Remove above reported ${removed.message} ${removed.count}`,
    );
    const undo = await f.edit("undo");
    check(
      undo.message === "undoDonePartial" &&
        undo.count === 3 &&
        undo.skippedCount === 3,
      `Undo reported ${undo.message} ${undo.count}/${undo.skippedCount}`,
    );
    check(
      f.count(line.slice(0, 3), "minecraft:air") === 3 &&
        f.count(line.slice(3), "minecraft:dirt") === 3,
      "Undo restored the wrong cells",
    );
    check(
      (await f.edit("undo")).message === "nothingToUndo",
      "Remove above added an Undo record",
    );
  });
}

export function buildRemoveAboveCancel(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 3, 3, f.cell(0, 1, 0));
    for (const cell of cells) f.block(cell).setType("minecraft:stone");
    await f.select(f.cell(2, 0, 2));
    const before = snapshot(f, cells);
    await f.menu("shape", "removeAbove");
    for (const tap of ["block", "air"] as const)
      check(
        (await f.tap(tap, f.cell(1, 0, 1))).flow.kind === "terrainConfirm",
        `A ${tap} tap changed the confirmation`,
      );
    check(
      (await f.menu("shape", "cut")).offered === false,
      "Shape entries were offered during the confirmation",
    );
    const cancelled = await f.menu("terrain", "cancel");
    check(
      cancelled.offered === true && cancelled.flow.kind === "point1",
      "Cancel did not return to aiming",
    );
    check(unchanged(f, cells, before), "Cancel wrote blocks");
    check(
      (await f.menu("terrain", "confirm")).offered === false,
      "Confirm was offered after Cancel",
    );
    check(unchanged(f, cells, before), "A stale confirm wrote blocks");
  });
}

export function buildCutSetsClipboard(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 1, 1);
    // The select helper places the first corner itself, so place the blocks afterwards.
    await f.select(f.cell(2));
    const types = [
      "minecraft:gold_block",
      "minecraft:oak_log",
      "minecraft:stone",
    ];
    cells.forEach((cell, i) => {
      f.block(cell).setType(types[i] ?? "minecraft:stone");
    });
    const before = snapshot(f, cells);
    check(
      (await f.menu("shape", "cut")).message === "editDone",
      "Cut with clipboard failed",
    );
    const after = await checkState(f, "pasteAim", true);
    check(f.count(cells, "minecraft:air") === 3, "Cut kept source blocks");
    check(
      after.clipboard?.contents.kind === "structure",
      "Cut clipboard is not a structure",
    );
    const target = f.region(3, 1, 1, f.cell(12, 0, 12));
    await pasteCutClipboard(f, f.cell(12, 0, 12), cells.length);
    check(unchanged(f, target, before), "Cut payload lost block states");
    await f.menu("paste", "endPaste");
  });
}

export function buildUndoHintOnce(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    const cells = f.region(2, 1, 1);
    for (const expectedHints of [1, 0]) {
      for (const cell of cells) f.block(cell).setType("minecraft:gold_block");
      await f.select(f.cell(1));
      f.block(f.cell()).setType("minecraft:gold_block");
      const result = await f.menu("shape", "place");
      check(
        result.message === "editDone" && result.count === 2,
        "Edit feedback missing",
      );
      check(
        result.undoHints === expectedHints,
        "Undo hint was missing or repeated",
      );
      const undo = await f.menu("utility", "undo");
      check(
        undo.message === "undoDone" && undo.undoHints === 0,
        "Undo emitted first-edit hint",
      );
    }
  });
}

export function buildUnstuckFill(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 6, 3);
    for (const cell of cells) f.block(cell).setType("minecraft:air");
    for (const cell of f.region(3, 1, 3))
      f.block(cell).setType("minecraft:stone");
    await f.select(f.cell(2, 3, 2));
    const feet = f.cell(1, 1, 1);
    f.player.teleport({ x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 });
    const rotation = f.player.getRotation();
    const result = await f.menu("shape", "fill");
    check(result.message === "editDone", "Fill did not complete");
    const actual = f.player.location;
    check(
      Math.abs(actual.x - (feet.x + 0.5)) < 0.01 &&
        Math.abs(actual.z - (feet.z + 0.5)) < 0.01 &&
        Math.abs(actual.y - f.cell(1, 4, 1).y) < 0.01,
      `Owner did not escape to the first free pair: ${JSON.stringify(actual)}`,
    );
    const after = f.player.getRotation();
    check(
      Math.abs(after.x - rotation.x) < 0.01 &&
        Math.abs(after.y - rotation.y) < 0.01,
      "Unstuck changed rotation",
    );
    check(
      f.count(f.region(3, 4, 3)) === 36,
      "Fill missed cells around the owner",
    );
    await f.menu("utility", "undo");
  });
}

export function buildUnstuckNotTouched(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const cell of f.region(3, 4, 3))
      f.block(cell).setType("minecraft:air");
    const feet = f.cell(5, 1, 1);
    for (const cell of f.region(1, 3, 1, f.cell(5, 0, 1)))
      f.block(cell).setType("minecraft:air");
    f.block(f.cell(5, 0, 1)).setType("minecraft:grass_block");
    f.block(feet).setType("minecraft:tall_grass");
    f.block({ ...feet, y: feet.y + 1 }).setPermutation(
      f.block(feet).permutation.withState("upper_block_bit", true),
    );
    await f.select(f.cell(2, 3, 2));
    f.player.teleport({ x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 });
    const result = await f.menu("shape", "fill");
    check(result.message === "editDone", "Remote Fill did not complete");
    const actual = f.player.location;
    check(
      Math.abs(actual.x - (feet.x + 0.5)) < 0.01 &&
        Math.abs(actual.z - (feet.z + 0.5)) < 0.01 &&
        Math.abs(actual.y - feet.y) < 0.01,
      `Untouched owner moved: ${JSON.stringify(actual)}`,
    );
    check(
      f.block(feet).typeId === "minecraft:tall_grass",
      "Remote Fill touched the owner's grass",
    );
    await f.menu("utility", "undo");
  });
}

/** A stone floor bounds every fixture so the scan cannot alter the arena below it. */
async function fillBelowPit(f: Fixture, water = false) {
  for (const cell of f.region(5, 7, 5, f.cell(0, -5, 0)))
    f.block(cell).setType("minecraft:stone");
  const pit = f.region(3, 5, 3, f.cell(1, -4, 1));
  for (const cell of pit)
    f.block(cell).setType(water ? "minecraft:water" : "minecraft:air");
  for (const cell of f.region(5, 2, 5, f.cell(0, 1, 0)))
    f.block(cell).setType("minecraft:air");
  await f.select(f.cell(4, 0, 4));
  return pit;
}

export function buildFillBelowPit(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const pit = await fillBelowPit(f);
    await f.menu("shape", "fillBelow");
    check(
      f.count(pit, "minecraft:air") === pit.length,
      "Fill wrote before confirmation",
    );
    const done = await f.menu("terrain", "confirm");
    check(
      done.message === "editDoneCount" && done.count === pit.length,
      "Wrong fill completion count",
    );
    check(f.count(pit) === pit.length, "Fill left a hole in the pit");
  });
}

export function buildFillBelowOverhang(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await fillBelowPit(f);
    const ceiling = f.region(2, 1, 3, f.cell(2, 0, 1));
    const ledge = f.region(1, 3, 3, f.cell(2, -3, 1));
    for (const cell of [...ceiling, ...ledge])
      f.block(cell).setType("minecraft:dirt");
    // The only entrance into the far pocket is below the ledge.
    const pocket = f.region(1, 4, 3, f.cell(3, -4, 1));
    await f.menu("shape", "fillBelow");
    await f.menu("terrain", "confirm");
    check(
      f.count(pocket) === pocket.length,
      "Fill did not climb behind the overhang",
    );
    check(
      f.count([...ceiling, ...ledge], "minecraft:dirt") ===
        ceiling.length + ledge.length,
      "Fill changed solid terrain",
    );
  });
}

export function buildFillBelowStaysInside(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await fillBelowPit(f);
    const tunnel = f.region(7, 1, 1, f.cell(3, -2, 2));
    for (const cell of tunnel) f.block(cell).setType("minecraft:air");
    const outside = tunnel.filter((c) => c.x > f.cell(4).x);
    const above = f.region(5, 1, 5, f.cell(0, 1, 0));
    const sealed = f.cell(0, -3, 0);
    f.block(sealed).setType("minecraft:air");
    await f.menu("shape", "fillBelow");
    await f.menu("terrain", "confirm");
    check(
      f.count(outside, "minecraft:air") === outside.length,
      "Fill escaped through the side passage",
    );
    check(
      f.count(above, "minecraft:air") === above.length,
      "Fill wrote above the top layer",
    );
    check(
      f.block(sealed).typeId === "minecraft:air",
      "Fill entered a disconnected cavity",
    );
  });
}

export function buildFillBelowWater(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const pit = await fillBelowPit(f, true);
    await f.menu("shape", "fillBelow");
    await f.menu("terrain", "confirm");
    check(f.count(pit) === pit.length, "Fill left water in the pit");
  });
}

export function buildFillBelowMaterialRefused(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const pit = await fillBelowPit(f);
    await f.tap("clear");
    f.block(f.cell()).setType("minecraft:sand");
    await f.tap("block");
    await f.tap("air", f.cell(4, 0, 4));
    const refused = await f.menu("shape", "fillBelow");
    check(
      refused.message === "fillMaterialRefused" &&
        refused.flow.kind === "endpoint",
      "Unstable fill material was accepted",
    );
    check(
      f.count(pit, "minecraft:air") === pit.length,
      "Refused fill wrote blocks",
    );
  });
}

export function buildFillBelowNoUndo(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    const old = f.cell(1);
    await f.select(old);
    f.block(old).setType("minecraft:dirt");
    await f.menu("shape", "place");
    const pit = await fillBelowPit(f);
    await f.menu("shape", "fillBelow");
    const done = await f.menu("terrain", "confirm");
    check(done.message === "editDoneCount", "Fill promised Undo");
    await f.edit("undo");
    check(f.block(old).typeId === "minecraft:dirt", "Earlier history was lost");
    check(f.count(pit) === pit.length, "Undo reverted Fill below");
    check(
      (await f.edit("undo")).message === "nothingToUndo",
      "Fill added history",
    );
  });
}

export function buildFillBelowUnstuck(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await fillBelowPit(f);
    const feet = f.cell(2, -4, 2);
    f.player.teleport({ x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 });
    await f.menu("shape", "fillBelow");
    await f.menu("terrain", "confirm");
    const position = f.player.location;
    check(
      Math.abs(position.x - feet.x - 0.5) < 0.01 &&
        Math.abs(position.z - feet.z - 0.5) < 0.01 &&
        position.y >= f.cell(0, 1).y,
      "Filled player did not escape upward in the same column",
    );
  });
}

function buildSideCylinder(a: Arena, axis: "x" | "z"): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = axis === "x" ? f.region(7, 5, 5) : f.region(5, 5, 7);
    const at = (along: number, y: number, across: number) =>
      axis === "x" ? f.cell(along, y, across) : f.cell(across, y, along);
    for (const [fill, expected] of [
      ["fill", 147],
      ["hollow", 102],
      ["tube", 84],
    ] as const) {
      for (const cell of cells) f.block(cell).setType("minecraft:air");
      await f.select(at(6, axis === "x" ? 4 : 0, 4));
      f.block(f.cell()).setType("minecraft:air");
      f.look(axis === "x" ? -90 : 0);
      // Teleport rotation is only readable on a later tick.
      await wait(1);
      const step = await f.menu("shape", "sideCylinder");
      check(
        step.offered === true && step.flow.kind === "heightStep",
        "sideways cylinder step missing",
      );
      f.look(axis === "x" ? 0 : -90);
      // Teleport rotation is only readable on a later tick.
      await wait(1);
      check(
        (await f.edit("height 5")).flow.previous === 5,
        "sideways cylinder height incorrect",
      );
      if (axis === "x")
        check(
          (await f.edit("height 2")).flow.previous === 5,
          "box height was not locked",
        );
      const done = await f.menu("contents", fill);
      check(
        done.message === "editDone" && f.count(cells) === expected,
        `sideways ${axis} ${fill} count incorrect`,
      );
      const stone = (along: number, y: number, across: number) =>
        f.block(at(along, y, across)).typeId === "minecraft:stone";
      check(stone(3, 2, 0) && stone(3, 0, 2), "sideways wall missing");
      check(!stone(3, 0, 0), "sideways ellipse filled a corner");
      check(
        stone(0, 2, 2) === (fill !== "tube") &&
          stone(6, 2, 2) === (fill !== "tube"),
        "sideways end caps incorrect",
      );
      check(
        stone(3, 2, 2) === (fill === "fill"),
        "sideways interior incorrect",
      );
      await f.edit("undo");
      check(f.count(cells) === 0, "sideways cylinder Undo left blocks");
    }
  });
}

export function buildSideCylinderX(a: Arena): Promise<Outcome> {
  return buildSideCylinder(a, "x");
}

export function buildSideCylinderZ(a: Arena): Promise<Outcome> {
  return buildSideCylinder(a, "z");
}

export function buildUndoSnapshot(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 3, 3);
    const min = f.cell();
    const max = f.cell(2, 2, 2);
    const pigTag = `undo_snapshot_pig_${a.lane.index}`;
    const cowTag = `undo_snapshot_cow_${a.lane.index}`;
    const inside = () =>
      a.dim.getEntities().filter((entity) => {
        const p = entity.location;
        return (
          p.x >= min.x &&
          p.x < max.x + 1 &&
          p.y >= min.y &&
          p.y < max.y + 1 &&
          p.z >= min.z &&
          p.z < max.z + 1
        );
      });
    const tagged = (tag: string) =>
      inside().filter((entity) => entity.hasTag(tag));
    const summon = (type: string, tag: string) => {
      const before = new Set(inside().map((entity) => entity.id));
      a.dim.runCommand(
        `summon ${type} ${min.x + 1.5} ${min.y + 1} ${min.z + 1.5}`,
      );
      const entity = inside().find(
        (entity) => entity.typeId === type && !before.has(entity.id),
      );
      check(entity !== undefined, `Missing summoned ${type}`);
      entity.addTag(tag);
    };
    const chestCell = f.cell(0, 1, 0);
    try {
      for (const cell of cells) f.block(cell).setType("minecraft:air");
      const floor = f.region(3, 1, 3);
      for (const cell of floor) f.block(cell).setType("minecraft:stone");
      f.block(chestCell).setType("minecraft:chest");
      const inventory = f
        .block(chestCell)
        .getComponent("minecraft:inventory")?.container;
      check(inventory !== undefined, "Chest inventory missing");
      inventory.setItem(0, new ItemStack("minecraft:diamond", 5));
      const before = snapshot(f, cells);
      summon("minecraft:pig", pigTag);
      await f.edit("reset");
      await f.edit(
        `snapshot ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z}`,
      );
      for (const pig of tagged(pigTag)) pig.remove();
      a.dim.runCommand(
        `fill ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z} minecraft:dirt`,
      );
      summon("minecraft:cow", cowTag);
      check(tagged(cowTag).length === 1, "Cow fixture missing before Undo");
      const undo = await f.edit("undo");
      check(
        undo.message === "undoDone" && undo.count === 27,
        `Snapshot Undo reported ${undo.message} ${undo.count}`,
      );
      check(
        unchanged(f, cells, before),
        "Snapshot Undo did not restore every cell",
      );
      check(
        f.count(floor) === floor.length,
        "Snapshot Undo did not restore stone",
      );
      check(
        f.block(chestCell).typeId === "minecraft:chest",
        "Snapshot Undo did not restore chest",
      );
      const item = f
        .block(chestCell)
        .getComponent("minecraft:inventory")
        ?.container?.getItem(0);
      check(
        item?.typeId === "minecraft:diamond" && item.amount === 5,
        "Snapshot Undo lost chest contents",
      );
      check(
        tagged(pigTag).filter((entity) => entity.typeId === "minecraft:pig")
          .length === 1,
        "Snapshot Undo did not restore exactly one pig",
      );
      check(tagged(cowTag).length === 0, "Snapshot Undo left the cow");
      check(
        (await f.edit("undo")).message === "nothingToUndo",
        "Snapshot Undo kept history",
      );
    } finally {
      for (const entity of a.dim.getEntities()) {
        if (entity.hasTag(pigTag) || entity.hasTag(cowTag)) entity.remove();
      }
      f.block(chestCell)
        .getComponent("minecraft:inventory")
        ?.container?.clearAll();
      for (const cell of cells) f.block(cell).setType("minecraft:air");
    }
  });
}

export function buildPasteRotate(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(5, 3, 3);
    const surround = f.region(5, 3, 7, f.cell(11, 0, -1));
    const target = f.region(3, 3, 5, f.cell(12));
    try {
      for (const c of source)
        f.block(c).setType(
          c.y === f.cell().y ? "minecraft:stone" : "minecraft:air",
        );
      for (const c of surround) f.block(c).setType("minecraft:gold_block");
      const chest = f.block(f.cell(1, 1, 1));
      chest.setType("minecraft:chest");
      chest
        .getComponent("minecraft:inventory")
        ?.container?.setItem(0, new ItemStack("minecraft:diamond", 7));
      const sign = f.block(f.cell(3, 1, 1));
      sign.setType("minecraft:standing_sign");
      sign
        .getComponent("minecraft:sign")
        ?.setText("Rotate front", SignSide.Front);
      sign
        .getComponent("minecraft:sign")
        ?.setText("Rotate back", SignSide.Back);
      await f.select(f.cell(4, 2, 2));
      check(
        (await f.menu("shape", "copy")).flow.kind === "pasteAim",
        "Copy did not start paste aiming",
      );
      await f.edit("rotate");
      check((await f.state()).pasteTurn === 1, "Rotate did not set the turn");
      const anchor = f.cell(12, -1);
      check(
        (await pasteStep(f, anchor.x, anchor.y, anchor.z, "up")).message ===
          "editDone",
        "Rotated paste failed",
      );
      for (const c of target) {
        const x = c.x - f.cell(12).x;
        const y = c.y - f.cell().y;
        const z = c.z - f.cell().z;
        const expected =
          y === 0
            ? "minecraft:stone"
            : y === 1 && x === 1 && z === 1
              ? "minecraft:chest"
              : y === 1 && x === 1 && z === 3
                ? "minecraft:standing_sign"
                : "minecraft:air";
        check(f.block(c).typeId === expected, "Rotated footprint mismatch");
      }
      const outside = surround.filter(
        (c) => !target.some((t) => t.x === c.x && t.y === c.y && t.z === c.z),
      );
      check(
        f.count(outside, "minecraft:gold_block") === outside.length,
        "Paste changed cells outside the rotated footprint",
      );
      const item = f
        .block(f.cell(13, 1, 1))
        .getComponent("minecraft:inventory")
        ?.container?.getItem(0);
      check(
        item?.typeId === "minecraft:diamond" && item.amount === 7,
        "Rotated chest lost items",
      );
      const pastedSign = f
        .block(f.cell(13, 1, 3))
        .getComponent("minecraft:sign");
      check(
        pastedSign?.getText(SignSide.Front) === "Rotate front" &&
          pastedSign.getText(SignSide.Back) === "Rotate back",
        "Rotated sign lost text",
      );
      check((await f.state()).pasteTurn === 1, "Paste lost the turn");
    } finally {
      await f.edit("releaseStructures");
      for (const c of [...source, ...surround]) {
        f.block(c).getComponent("minecraft:inventory")?.container?.clearAll();
        f.block(c).setType("minecraft:air");
      }
    }
  });
}

export function buildPasteStructure(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(8, 4, 4);
    const target = f.region(8, 4, 4, f.cell(12));
    const inside = (offset: number) =>
      a.dim.getEntities().filter((e) => {
        const p = e.location;
        const min = f.cell(offset);
        return (
          e.typeId !== "minecraft:player" &&
          p.x >= min.x &&
          p.x < min.x + 8 &&
          p.y >= min.y &&
          p.y < min.y + 4 &&
          p.z >= min.z &&
          p.z < min.z + 4
        );
      });
    try {
      for (const c of [...source, ...target])
        f.block(c).setType(
          c.y === f.cell().y ? "minecraft:stone" : "minecraft:air",
        );
      const chest = f.block(f.cell(1, 1, 1));
      chest.setType("minecraft:chest");
      chest
        .getComponent("minecraft:inventory")
        ?.container?.setItem(0, new ItemStack("minecraft:diamond", 7));
      const sign = f.block(f.cell(3, 1, 1));
      sign.setType("minecraft:standing_sign");
      sign
        .getComponent("minecraft:sign")
        ?.setText("Paste front", SignSide.Front);
      sign.getComponent("minecraft:sign")?.setText("Paste back", SignSide.Back);
      for (const offset of [0, 12]) {
        const c = f.cell(offset + 5, 1, 1);
        placeSupportedFrame(f, c);
        const cow = f.cell(offset + 6.5, 1, 2.5);
        a.dim.runCommand(`summon minecraft:cow ${cow.x} ${cow.y} ${cow.z}`);
      }
      const oldCow = inside(12).find((e) => e.typeId === "minecraft:cow");
      check(!!oldCow, "missing target cow");
      const min = f.cell();
      const max = f.cell(7, 3, 3);
      await f.edit(
        `structure ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z}`,
      );
      const anchor = f.cell(12, -1);
      const pasted = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
      check(
        pasted.message === "editDone" && pasted.count === source.length,
        "structure paste failed",
      );
      const item = f
        .block(f.cell(13, 1, 1))
        .getComponent("minecraft:inventory")
        ?.container?.getItem(0);
      check(
        item?.typeId === "minecraft:diamond" && item.amount === 7,
        "chest payload lost",
      );
      const copiedSign = f
        .block(f.cell(15, 1, 1))
        .getComponent("minecraft:sign");
      check(
        copiedSign?.getText(SignSide.Front) === "Paste front" &&
          copiedSign.getText(SignSide.Back) === "Paste back",
        "sign text lost",
      );
      check(
        target.filter((c) => f.block(c).typeId === "minecraft:frame").length ===
          1 && f.block(f.cell(17, 1, 1)).typeId === "minecraft:frame",
        "frame was not replaced",
      );
      check(
        !oldCow.isValid &&
          inside(12).filter((e) => e.typeId === "minecraft:cow").length === 1,
        "animal replacement failed",
      );
      f.block(f.cell(19, 3, 3)).setType("yasu_ride:camper_bed");
      const before = snapshot(f, target);
      const cowIds = inside(12)
        .map((e) => e.id)
        .sort()
        .join(",");
      await wait(BUILD_SPEC.pasteRepeatTicks);
      const refused = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
      check(
        refused.message === "pasteBlocked" && unchanged(f, target, before),
        "protected structure paste changed blocks",
      );
      check(
        inside(12)
          .map((e) => e.id)
          .sort()
          .join(",") === cowIds,
        "protected paste changed entities",
      );
    } finally {
      await f.edit("releaseStructures");
      for (const entity of [...inside(0), ...inside(12)]) entity.remove();
    }
  });
}

const cellKey = (p: { x: number; y: number; z: number }): string =>
  `${p.x},${p.y},${p.z}`;

export async function buildPasteStructureDecor(
  a: Arena,
  onStep?: StepSink,
): Promise<Outcome> {
  const results: { name: string; pass: boolean; value: string }[] = [];
  const record = (name: string, pass: boolean, value: unknown = pass) =>
    results.push({ name, pass, value: String(value) });
  const cleanup = (name: string, run: () => void) => {
    try {
      run();
    } catch (error) {
      record(name, false, error);
    }
  };
  let phase = "setup";
  try {
    const outcome = await withBuilder(a, async (f) => {
      const source = f.region(8, 6, 8);
      const target = f.region(8, 6, 8, f.cell(12));
      const inventory = f.player.getComponent("minecraft:inventory")?.container;
      check(!!inventory, "player inventory missing");
      const savedItems = Array.from({ length: inventory.size }, (_, slot) =>
        inventory.getItem(slot),
      );
      const wandSlot = f.player.selectedSlotIndex;
      const restoreInventory = () => {
        savedItems.forEach((item, slot) => {
          inventory.setItem(slot, item);
        });
        f.player.selectedSlotIndex = wandSlot;
      };
      const inside = (p: Cell, offset: number, margin = 0) => {
        const min = f.cell(offset);
        return (
          p.x >= min.x - margin &&
          p.x < min.x + 8 + margin &&
          p.y >= min.y - margin &&
          p.y < min.y + 6 + margin &&
          p.z >= min.z - margin &&
          p.z < min.z + 8 + margin
        );
      };
      const entities = (offset: number, margin = 0) =>
        a.dim
          .getEntities()
          .filter(
            (e) =>
              e.typeId !== "minecraft:player" &&
              inside(e.location, offset, margin),
          );
      const paintings = (offset: number) =>
        entities(offset).filter((e) => e.typeId === "minecraft:painting");
      const items = (offset: number) =>
        entities(offset, 1).filter((e) => e.typeId === "minecraft:item");
      const removeItems = () => {
        for (const offset of [0, 12])
          for (const entity of items(offset)) entity.remove();
      };
      const drops = (offset: number) =>
        items(offset).map(
          (e) => e.getComponent("minecraft:item")?.itemStack.typeId,
        );
      const frames = (cells: Cell[]) =>
        cells.filter((c) => f.block(c).typeId === "minecraft:frame");
      const interacted = new Set<string>();
      const listener = (event: PlayerInteractWithBlockAfterEvent) => {
        if (
          event.player.id === f.player.id &&
          event.block.dimension.id === a.dim.id &&
          event.block.typeId === "minecraft:frame" &&
          inside(event.block.location, 0) &&
          event.beforeItemStack?.typeId === "minecraft:diamond"
        )
          interacted.add(cellKey(event.block.location));
      };
      const setupState = () => {
        const allFrames = frames(source);
        const frame = allFrames.find((c) => interacted.has(cellKey(c)));
        return {
          frame,
          missing: [
            ...(allFrames.length === 0 ? ["item frame"] : []),
            ...(!frame ? ["diamond interaction with the frame"] : []),
            ...(paintings(0).length === 0 ? ["painting"] : []),
          ],
        };
      };
      const breakFrame = (c: Cell) =>
        a.dim.runCommand(`setblock ${c.x} ${c.y} ${c.z} air destroy`);
      world.afterEvents.playerInteractWithBlock.subscribe(listener);
      try {
        for (const offset of [0, 12])
          for (const entity of entities(offset)) entity.remove();
        for (const c of [...source, ...target])
          f.block(c).setType(
            c.y === f.cell().y ? "minecraft:stone" : "minecraft:air",
          );
        for (const offset of [0, 12])
          for (const c of f.region(1, 4, 6, f.cell(offset + 1, 1, 1)))
            f.block(c).setType("minecraft:stone");
        inventory.clearAll();
        // Stable APIs cannot populate a frame or create a painting (ADR 0243).
        for (const type of [
          "minecraft:frame",
          "minecraft:diamond",
          "minecraft:painting",
        ])
          inventory.addItem(new ItemStack(type, 1));
        f.player.selectedSlotIndex = 0;
        f.player.teleport(f.cell(4.5, 1, 3.5), {
          dimension: a.dim,
          facingLocation: f.cell(1, 2, 3.5),
        });
        const prompt =
          "Structure paste decor check: within 60 seconds, place the item frame on the stone wall, put the diamond into it, and hang the painting on the wall.";
        f.player.sendMessage(prompt);
        f.player.onScreenDisplay.setActionBar(prompt);
        let setup = setupState();
        for (
          let ticks = 0;
          ticks < 1200 && setup.missing.length > 0;
          ticks += 10
        ) {
          await wait(10);
          setup = setupState();
          // The player setup window exceeds the runner's 60-second stall watch.
          if ((ticks + 10) % 200 === 0)
            onStep?.({
              name: `setup_wait_${ticks + 10}`,
              pass: true,
              detail: `polled setup after ${ticks + 10} ticks; missing: ${setup.missing.join(", ") || "none"}`,
            });
        }
        const cell = setup.frame;
        if (!cell || setup.missing.length > 0) {
          record(
            "setup",
            false,
            `fixture incomplete; missing: ${setup.missing.join(", ")}`,
          );
          return;
        }
        record(
          "setup",
          true,
          "player placed frame, interacted with diamond, and hung painting",
        );
        const originalPaintings = paintings(0).length;
        record("painting_setup", originalPaintings === 1, originalPaintings);
        const permutation = f.block(cell).permutation;
        restoreInventory();
        f.player.teleport(a.at(45, a.gy, 45), { dimension: a.dim });
        await wait(BUILD_SPEC.modeEnterTicks + 2);
        removeItems();
        const min = f.cell();
        const max = f.cell(7, 5, 7);
        await f.edit(
          `structure ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z}`,
        );
        // Capture before breaking the original so the clipboard retains its contents.
        breakFrame(cell);
        await wait(2);
        const originalDrops = drops(0);
        const observed = originalDrops.includes("minecraft:diamond");
        record(
          "frame_setup_observed",
          observed,
          observed
            ? originalDrops.join(",")
            : `fixture failure: destroy-drop observation produced no diamond; drops=${originalDrops.join(",")}`,
        );
        removeItems();
        if (!observed || originalPaintings !== 1) return;
        phase = "paste";
        const mirrored = { ...cell, x: cell.x + 12 };
        f.block(mirrored).setPermutation(permutation);
        const anchor = f.cell(12, -1);
        const pasted = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
        record(
          "paste",
          pasted.message === "editDone" && pasted.count === source.length,
          pasted.message,
        );
        await wait(2);
        record(
          "item_frame_block",
          frames(target).length === 1 &&
            f.block(mirrored).typeId === "minecraft:frame",
        );
        const firstPaintings = paintings(12);
        record("painting", firstPaintings.length === 1, firstPaintings.length);
        breakFrame(mirrored);
        await wait(2);
        const pastedDrops = drops(12);
        record(
          "item_frame",
          pastedDrops.includes("minecraft:diamond"),
          pastedDrops.join(","),
        );
        removeItems();
        await wait(BUILD_SPEC.pasteRepeatTicks);
        f.block(mirrored).setPermutation(permutation);
        const repeated = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
        record(
          "paste_repeat",
          repeated.message === "editDone" && repeated.count === source.length,
          repeated.message,
        );
        await wait(2);
        const repeatedPaintings = paintings(12);
        record(
          "painting_replaced",
          repeatedPaintings.length === 1 &&
            firstPaintings.every((e) => !e.isValid),
          repeatedPaintings.length,
        );
      } finally {
        cleanup("cleanup_listener", () =>
          world.afterEvents.playerInteractWithBlock.unsubscribe(listener),
        );
        try {
          await f.edit("releaseStructures");
        } finally {
          for (const offset of [0, 12])
            cleanup("cleanup_entities", () => {
              for (const entity of entities(offset))
                cleanup("cleanup_entity", () => entity.remove());
            });
          cleanup("cleanup_drops", removeItems);
          if (f.player.isValid) cleanup("restore_inventory", restoreInventory);
        }
      }
    });
    if (!outcome.pass) record("fixture", false, outcome.detail);
  } catch (error) {
    record(
      phase,
      false,
      `${phase === "setup" ? "fixture failure: " : ""}${error instanceof Error ? `${error.name}:${error.message}` : error}`,
    );
  }
  return {
    pass: results.length > 0 && results.every((r) => r.pass),
    detail: results
      .map(
        ({ name, pass, value }) =>
          `${name}=${pass ? "PASS" : "FAIL"}(${value})`,
      )
      .join("; "),
  };
}

export function buildUndoMixedTen(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(2, 2, 2);
    await f.select(f.cell(1, 1, 1));
    for (const cell of source) f.block(cell).setType("minecraft:gold_block");
    const original = snapshot(f, source);
    const targets = Array.from({ length: 8 }, (_, i) =>
      pasteTarget(f, f.cell(8 + i * 3, 0, 24), 2, 2, 2),
    );
    check(
      (await f.menu("shape", "fill")).count === source.length,
      "Fill failed",
    );
    await f.select(f.cell(1, 1, 1));
    check((await f.menu("shape", "cut")).message === "editDone", "Cut failed");
    check(
      f.count(source, "minecraft:air") === source.length,
      "Cut left blocks",
    );
    for (const target of targets) {
      const pasted = await pasteStep(
        f,
        target.anchor.x,
        target.anchor.y,
        target.anchor.z,
        "up",
      );
      check(pasted.message === "editDone", "Paste failed");
      check(
        f.count(target.cells) === target.cells.length,
        "Paste lost filled blocks",
      );
    }
    await endPasteStep(f);
    for (const target of [...targets].reverse()) {
      check(
        (await f.menu("utility", "undo")).message === "undoDone",
        "Paste Undo unavailable",
      );
      check(
        unchanged(f, target.cells, target.before),
        "Paste Undo lost destination states",
      );
    }
    check(
      (await f.menu("utility", "undo")).message === "undoDone",
      "Cut Undo unavailable",
    );
    check(f.count(source) === source.length, "Cut Undo lost filled blocks");
    check(
      (await f.menu("utility", "undo")).message === "undoDone",
      "Fill Undo unavailable",
    );
    check(
      unchanged(f, source, original),
      "Ten mixed undos lost original source states",
    );
    for (const target of targets)
      check(
        unchanged(f, target.cells, target.before),
        "Ten mixed undos lost original destination states",
      );
    check(
      (await f.menu("utility", "undo")).offered === false,
      "History survived ten undos",
    );
  });
}
