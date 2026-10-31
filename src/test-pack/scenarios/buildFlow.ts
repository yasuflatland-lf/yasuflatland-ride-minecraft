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
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const saved = new Map<
    string,
    { cell: Cell; permutation: BlockPermutation }
  >();
  const responses: Reply[] = [];
  const listener = (ev: { id: string; message: string }) => {
    if (ev.id !== TEST_RESULT_EVENT) return;
    const reply: Reply = JSON.parse(ev.message);
    if (reply.player === player.name) responses.push(reply);
  };
  const query = async (event: string, message: string): Promise<Reply> => {
    responses.length = 0;
    system.sendScriptEvent(event, message);
    for (let tick = 0; tick < 220; tick++) {
      await wait(1);
      const response = responses.at(-1);
      if (response) {
        check(!response.timedOut, `edit timed out: ${message}`);
        return response;
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
    menu: (menu: string, id: string, skipAir = false) =>
      edit(`menu ${menu} ${id} ${skipAir ? 1 : 0}`),
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
  menu(menu: string, id: string, skipAir?: boolean): Promise<Reply>;
  mode(): Promise<Reply>;
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
          (await f.menu("roof", id)).offered === false,
          "roof entry offered before roof choice",
        );
      check(
        (await f.menu("shape", kind)).flow.kind === "roofHeight",
        "roof height step missing",
      );
      check(
        (await f.edit("height 3")).flow.previous === 3,
        "height not applied",
      );
      const before = snapshot(f, cells);
      const result = await f.menu("roof", style);
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
          (await f.menu("roof", id)).offered === false,
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
      (await f.mode()).flow.kind === "endpoint",
      "item switch cancelled endpoint",
    );
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    check(
      (await f.menu("shape", "cancel")).flow.kind === "point1",
      "shape Cancel did not resume aiming",
    );
    await f.tap("air", f.cell(4, 0, 4));
    await f.menu("shape", "gable");
    check(
      (await f.menu("roof", "cancel")).flow.kind === "point1",
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
    check(
      (await f.menu("utility", "copy")).message === "copied",
      "copy failed",
    );
    for (const [face, dx, dy, dz] of [
      ["up", 0, 1, 0],
      ["down", 0, -1, 0],
      ["east", 1, 0, 0],
      ["west", -1, 0, 0],
      ["north", 0, 0, -1],
      ["south", 0, 0, 1],
    ] as const) {
      for (const skipAir of [false, true]) {
        const anchor = f.cell(10, 2, 10);
        f.block(anchor).setType("minecraft:gold_block");
        const target = f.region(3, 1, 1, {
          x: anchor.x + dx,
          y: anchor.y + dy,
          z: anchor.z + dz,
        });
        for (const c of target) f.block(c).setType("minecraft:gold_block");
        const before = snapshot(f, target);
        const aiming = await f.menu("utility", "paste", skipAir);
        check(
          aiming.offered === true &&
            aiming.flow.kind === "pasteAim" &&
            aiming.flow.skipAir === skipAir,
          "paste aiming missing",
        );
        const pasted = await f.edit(
          `pasteat ${anchor.x} ${anchor.y} ${anchor.z} ${face}`,
        );
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
      }
    }
    await f.edit("undo");
  });
}
