import {
  type BlockPermutation,
  ItemStack,
  system,
  world,
} from "@minecraft/server";
import { blockStateOf, sameBlockState } from "../../domain/build/blockState";
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
import type { Outcome } from "../outcome";

interface BuildState {
  flow: string;
  clipboardHeld: boolean;
  pasteMenu: string[];
}

interface Reply {
  player: string;
  message?: string;
  count?: number;
  offered?: boolean;
  timedOut?: boolean;
  flow: { kind: string; previous?: number; skipAir?: boolean };
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
    cell,
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
    skipAir = false,
    height,
  }: {
    skipAir?: boolean;
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
    copied = await f.edit("confirmcopy");
  }
  check(
    copied.message === "copied" &&
      copied.flow.kind === "pasteAim" &&
      copied.flow.skipAir === false,
    "Copy did not enter paste aiming with Skip air off",
  );
  if (skipAir) {
    const toggled = await f.menu("paste", "skipAir");
    check(
      toggled.offered === true && toggled.flow.skipAir === true,
      "Skip air toggle failed",
    );
  }
  return copied;
}

function pasteStep(
  f: Fixture,
  x: number,
  y: number,
  z: number,
  face: string,
): Promise<Reply> {
  return f.edit(`pasteat ${x} ${y} ${z} ${face}`);
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
      withoutHistory.pasteMenu.join() === "skipAir,newCopy,endPaste",
      "Paste menu without history has unexpected entries",
    );
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await pasteInto(f, target);
    const withHistory = await checkState(f, "pasteAim", true);
    check(
      withHistory.pasteMenu.join() === "undo,skipAir,newCopy,endPaste",
      "Paste menu with history must have exactly four ordered entries",
    );
    await f.menu("paste", "undo");
    check(
      unchanged(f, target.cells, target.before),
      "menu Undo did not restore blocks",
    );
    check(
      (await f.state()).pasteMenu.join() === "skipAir,newCopy,endPaste",
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
    await f.edit("confirmcopy");
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

export function buildPasteToggleNext(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    f.block(f.cell(1)).setType("minecraft:air");
    await f.menu("paste", "newCopy");
    await f.select(f.cell(1));
    await f.menu("shape", "copy");
    await checkState(f, "pasteAim", true);
    const first = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    const second = pasteTarget(f, f.cell(16, 0, 12), 2, 1, 1);
    const third = pasteTarget(f, f.cell(20, 0, 12), 2, 1, 1);
    await pasteInto(f, first);
    check(
      f.block(first.cells[1] as Cell).typeId === "minecraft:air",
      "Skip air was not off by default",
    );
    const beforeToggle = snapshot(f, first.cells);
    await f.menu("paste", "skipAir");
    await pasteInto(f, second);
    check(
      f.block(second.cells[0] as Cell).typeId === "minecraft:stone" &&
        f.block(second.cells[1] as Cell).typeId === "minecraft:gold_block",
      "Skip air did not apply to the next Paste",
    );
    check(
      unchanged(f, first.cells, beforeToggle),
      "toggle changed the previous Paste",
    );
    await f.menu("paste", "skipAir");
    await pasteInto(f, third);
    check(
      f.block(third.cells[1] as Cell).typeId === "minecraft:air",
      "Skip air did not toggle off",
    );
    await checkState(f, "pasteAim", true);
    for (const target of [third, second, first]) {
      await f.menu("paste", "undo");
      check(
        unchanged(f, target.cells, target.before),
        "toggle Paste Undo lost blocks",
      );
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
      for (const skipAir of [false, true]) {
        await f.select(f.cell(2));
        await startPasteStep(f, { skipAir });
        const anchor = f.cell(10, 2, 10);
        f.block(anchor).setType("minecraft:gold_block");
        const target = f.region(3, 1, 1, {
          x: anchor.x + dx,
          y: anchor.y + dy,
          z: anchor.z + dz,
        });
        for (const c of target) f.block(c).setType("minecraft:gold_block");
        const before = snapshot(f, target);
        const pasted = await pasteStep(f, anchor.x, anchor.y, anchor.z, face);
        check(pasted.message === "editDone", "aimed paste failed");
        const actual = snapshot(f, target);
        check(
          actual[0]?.typeId === "minecraft:stone" &&
            actual[1]?.typeId ===
              (skipAir ? "minecraft:gold_block" : "minecraft:air") &&
            actual[2]?.typeId === "minecraft:oak_log" &&
            actual[2]?.states.pillar_axis === "z",
          `paste anchor/states/skipAir wrong for ${face} ${skipAir}`,
        );
        await f.edit("undo");
        check(
          unchanged(f, target, before),
          "paste undo did not restore destination",
        );
        await endPasteStep(f);
      }
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
      const expected = snapshot(f, source);
      const copied = await startPasteStep(f, {
        height: heightStep ? 3 : undefined,
      });
      check(
        copied.message === "copied" && copied.count === source.length,
        "Copy count wrong",
      );
      const target = pasteTarget(f, f.cell(12, 0, 12), 3, sy, sz);
      check(
        (
          await pasteStep(
            f,
            target.anchor.x,
            target.anchor.y,
            target.anchor.z,
            "up",
          )
        ).message === "editDone",
        "shape copy paste failed",
      );
      check(
        unchanged(f, target.cells, expected),
        "shape Copy lost source block states",
      );
      await f.menu("paste", "undo");
      check(
        unchanged(f, target.cells, target.before),
        "shape copy undo lost destination states",
      );
      await endPasteStep(f);
    }
  });
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
    for (const target of [...targets].reverse()) {
      const undone = await f.menu("paste", "undo");
      check(
        undone.offered === true &&
          undone.message === "undoDone" &&
          undone.flow.kind === "pasteAim",
        "Undo unavailable while pasting",
      );
      check(
        unchanged(f, target.cells, target.before),
        "continuous Paste undo lost destination states",
      );
    }
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

export function buildPasteSkipAir(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.select(f.cell(1));
    f.block(f.cell(1)).setType("minecraft:air");
    await startPasteStep(f);
    for (const skipAir of [true, false]) {
      const toggled = await f.menu("paste", "skipAir");
      check(
        toggled.offered === true && toggled.flow.skipAir === skipAir,
        "skip-air toggle failed",
      );
      const anchor = f.cell(skipAir ? 10 : 14, 0, 10);
      const target = f.region(2, 1, 1, { ...anchor, y: anchor.y + 1 });
      for (const cell of target) f.block(cell).setType("minecraft:gold_block");
      const pasted = await f.edit(
        `pasteat ${anchor.x} ${anchor.y} ${anchor.z} up`,
      );
      check(pasted.message === "editDone", "paste after toggle failed");
      check(
        snapshot(f, target)[0]?.typeId === "minecraft:stone",
        "solid cell was not pasted",
      );
      check(
        snapshot(f, target)[1]?.typeId ===
          (skipAir ? "minecraft:gold_block" : "minecraft:air"),
        "paste ignored skip-air setting",
      );
    }
  });
}
