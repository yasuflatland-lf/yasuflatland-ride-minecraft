import {
  type BlockPermutation,
  Direction,
  InputMode,
  ItemStack,
  type Player,
  type PlayerInteractWithBlockAfterEvent,
  SignSide,
  system,
  world,
} from "@minecraft/server";
import { virtualEndPoint } from "../../domain/build/aim/aim";
import {
  type BlockState,
  blockStateOf,
  sameBlockState,
} from "../../domain/build/blockState";
import { boxOf, type CellBox, cellBox } from "../../domain/build/box";
import type { Clipboard } from "../../domain/build/clipboard/clipboard";
import {
  type RoofSpec,
  roofCells,
  roofSlopeAt,
} from "../../domain/build/roof/roof";
import type { Facing } from "../../domain/build/rotation/facing";
import { BUILD_SPEC } from "../../domain/build/spec";
import {
  type Cell,
  cellCenter,
  cellKey,
  cellOf,
  sameCell,
} from "../../domain/shared/cells";
import { distanceSq, type Vec3 } from "../../domain/shared/vec";
import { blockHeightRange } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import {
  BUILD_UNDO_TYPE,
  LAID_BLOCK_TAG,
  PASTE_PLACE_TYPE,
  PASTE_ROTATE_TYPE,
  SELECTION_WAND_TYPE,
  TAP_TARGET_TYPE,
  TEST_EDIT_EVENT,
  TEST_INPUT_EVENT,
  TEST_MODE_EVENT,
  TEST_PRESS_EVENT,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
  TEST_TAP_TARGET_EVENT,
} from "../../infrastructure/build/identifiers";
import { type Arena, wait } from "../arena";
import {
  SETUP_LIMIT_TICKS,
  SETUP_POLL_TICKS,
  SETUP_REPORT_TICKS,
  setupProgressStep,
  setupPromptStep,
  setupTimeoutDetail,
} from "../decorSetup";
import type { Outcome, StepSink } from "../outcome";

const LOOK_SETTLE_MAX_TICKS = 20;

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
  menu?: readonly { id: string }[];
  undoHints?: number;
  pasteReadyDegrees?: number;
  timedOut?: boolean;
  flow: {
    kind: string;
    liveHeight?: number;
    menuLevel?: "root" | "build";
    heightLocked?: boolean;
    heightedKind?: string;
    start?: { cell: Cell; dimensionId: string; material: BlockState };
    taps?: { from: Cell; to: Cell };
    selection?: { box: BoxBounds };
  };
  mode?: boolean;
  sessionPresent?: boolean;
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
  const at = (x: number, y: number, z: number): Vec3 => ({
    x: origin.x + x,
    y: origin.y + y,
    z: origin.z + z,
  });
  const cell = (x = 0, y = 0, z = 0): Cell => cellOf(at(x, y, z));
  const tap = (tap: "block" | "air" | "clear" | "fixHeight", at = cell()) =>
    query(TEST_TAP_EVENT, JSON.stringify({ player: player.name, tap, ...at }));
  const edit = (command: string) =>
    query(TEST_EDIT_EVENT, `${player.id} ${command}`);
  const region = (sx: number, sy: number, sz: number, offset = cell()) => {
    const cells: Cell[] = [];
    for (let x = 0; x < sx; x++)
      for (let y = 0; y < sy; y++)
        for (let z = 0; z < sz; z++)
          cells.push(
            cellOf({ x: offset.x + x, y: offset.y + y, z: offset.z + z }),
          );
    for (const c of cells) block(c);
    return cells;
  };
  const f = {
    player,
    at,
    cell,
    lookSettled: async (yaw: number, pitch = 25): Promise<void> => {
      // A connected client sends its own rotation, so a teleport may be
      // overwritten or not yet applied one tick later.
      player.teleport(player.location, { rotation: { x: pitch, y: yaw } });
      let settledTicks = 0;
      let r = player.getRotation();
      for (let tick = 0; tick < LOOK_SETTLE_MAX_TICKS; tick++) {
        await wait(1);
        r = player.getRotation();
        const yawDelta = ((((r.y - yaw) % 360) + 540) % 360) - 180;
        if (Math.abs(yawDelta) <= 1 && Math.abs(r.x - pitch) <= 1)
          settledTicks++;
        else settledTicks = 0;
        if (settledTicks === 2) return;
        player.teleport(player.location, { rotation: { x: pitch, y: yaw } });
      }
      throw new Error(
        `view rotation did not settle: wanted yaw=${yaw} pitch=${pitch}, saw yaw=${r.y} pitch=${r.x}`,
      );
    },
    block,
    tap,
    edit,
    press: (routes: string, gapTicks = 0) =>
      query(
        TEST_PRESS_EVENT,
        `${player.id} ${routes}${gapTicks ? ` ${gapTicks}` : ""}`,
      ),
    holdControl: (typeId: string) =>
      inventory.setItem(player.selectedSlotIndex, new ItemStack(typeId)),
    region,
    state: () => query<BuildState>(TEST_EDIT_EVENT, `${player.id} state`),
    switchItem: async (wand = false) => {
      if (!wand) inventory.setItem(otherSlot, undefined);
      await edit(`slot ${wand ? slot : otherSlot}`);
      await wait(BUILD_SPEC.modeLeaveTicks + 4);
    },
    menu: async (menu: string, id: string) => {
      if (
        menu === "shape" &&
        [
          "fill",
          "frame",
          "faces",
          "walls",
          "gable",
          "hip",
          "cylinder",
          "sideCylinder",
          "sphere",
          "cube",
        ].includes(id)
      ) {
        await edit("menu shape buildShape");
      }
      return edit(`menu ${menu} ${id}`);
    },
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
      const endpoint = await tap(air ? "air" : "block", end);
      if (endpoint.flow.kind === "baseHeight") await tap("fixHeight");
    },
    count: (cells: Cell[], type = "minecraft:stone") =>
      cells.filter((c) => block(c).typeId === type).length,
  };
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    player.teleport(a.at(45, a.gy, 45), { dimension: a.dim });
    f.hold(true);
    await f.lookSettled(-90);
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
  at(x: number, y: number, z: number): Vec3;
  player: Player;
  lookSettled(yaw: number, pitch?: number): Promise<void>;
  cell(x?: number, y?: number, z?: number): Cell;
  block(cell: Cell): NonNullable<ReturnType<Arena["dim"]["getBlock"]>>;
  tap(
    tap: "block" | "air" | "clear" | "fixHeight",
    cell?: Cell,
  ): Promise<Reply>;
  edit(command: string): Promise<Reply>;
  press(routes: string, gapTicks?: number): Promise<Reply>;
  holdControl(typeId: string): void;
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
      const end = f.cell(sx - 1, sy - 1, sz - 1);
      await f.select(end, id !== "fill");
      const before = snapshot(f, cells);
      for (const absent of sy === 5 ? ["frame"] : ["faces", "walls"])
        check(
          (await f.menu("shape", absent)).offered === false,
          `${absent} incorrectly offered for ${id}`,
        );
      const result = await f.menu("shape", id);
      check(
        result.offered === true && result.message === "editDoneCount",
        `${id} did not finish`,
      );
      checkSelection(result, { min: f.cell(), max: end }, id);
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
      const end = f.cell(4, kind === "gable" ? 3 : 0, 4);
      await f.select(end);
      f.block(f.cell()).setType("minecraft:air");
      for (const id of ["fill", "hollow", "cancel"])
        check(
          (await f.menu("contents", id)).offered === false,
          "roof entry offered before roof choice",
        );
      const step = (await f.menu("shape", kind)).flow;
      check(
        step.kind === "heightStep" &&
          step.heightLocked === false &&
          step.liveHeight === 1,
        "roof did not start its own height step",
      );
      check(
        (await f.edit("height 3")).flow.liveHeight === 3,
        "height not applied",
      );
      const before = snapshot(f, cells);
      const result = await f.menu("contents", style);
      check(
        result.offered === true && result.message === "editDoneCount",
        "roof did not finish",
      );
      check(
        f.count(cells) === expected,
        `${kind} ${style}: expected ${expected}, got ${f.count(cells)}`,
      );
      checkSelection(result, { min: f.cell(), max: f.cell(4, 2, 4) }, kind);
      for (const id of ["fill", "hollow", "cancel"])
        check(
          (await f.menu("contents", id)).offered === false,
          "roof entry offered after confirmation",
        );
      const undone = await f.edit("undo");
      checkSelection(undone, { min: f.cell(), max: end }, "roof Undo");
      check(unchanged(f, cells, before), "roof undo changed original cells");
    }
  });
}

export function buildTerrace(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const hill = f.region(3, 6, 6);
    for (const cell of hill) f.block(cell).setType("minecraft:stone");
    const overhang = f.block(f.cell(1, 6, 1));
    overhang.setType("minecraft:stone");
    const foot = { min: f.cell(), max: f.cell(2) };
    const goal = f.cell(0, 2, 5);
    await f.select(foot.max);
    const aim = await f.menu("shape", "terrace");
    check(
      aim.offered === true && aim.flow.kind === "stairAim",
      "Terrace did not enter aiming",
    );
    try {
      await f.edit(`aim ${goal.x} ${goal.y} ${goal.z}`);
      check(
        (await f.tap("block", goal)).flow.kind === "stairContents",
        "Terrace did not fix the goal",
      );
      const built = await f.menu("terrace", "confirm");
      check(
        built.offered === true &&
          built.message === "editDoneCount" &&
          built.count === 69,
        "Terrace did not remove 69 blocks",
      );
      checkSelection(
        built,
        { min: goal, max: f.cell(2, 2, 5) },
        "Terrace goal",
      );
      for (const cell of hill) {
        const z = cell.z - foot.min.z;
        const surface = foot.min.y + (z === 0 ? 0 : z <= 3 ? 1 : 2);
        const expected =
          cell.y <= surface ? "minecraft:stone" : "minecraft:air";
        check(
          f.block(cell).typeId === expected,
          `Unexpected terrace block at ${cellKey(cell)}`,
        );
      }
      check(
        overhang.typeId === "minecraft:stone",
        "Terrace removed the overhang",
      );
      checkSelection(await f.edit("undo"), foot, "Terrace Undo");
      check(
        f.count(hill) === hill.length,
        "Undo did not restore the stone hill",
      );
    } finally {
      await f.edit("aim clear");
    }
  });
}

export function buildStairs(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 8, 7, f.cell(-1, -1, -1));
    for (const contents of ["stepsOnly", "passage"] as const) {
      const passage = contents === "passage";
      for (const cell of cells)
        f.block(cell).setType(passage ? "minecraft:stone" : "minecraft:air");
      await f.tap("clear");
      const min = f.cell();
      const max = f.cell(2);
      const goal = f.cell(1, 2, 4);
      const material = "minecraft:oak_stairs";
      const first = f.block(min);
      first.setType(material);
      first.setPermutation(
        first.permutation
          .withState("weirdo_direction", 0)
          .withState("upside_down_bit", true),
      );
      await f.tap("block", min);
      checkSelection(await f.tap("air", max), { min, max }, "Stair foot");
      first.setType("minecraft:stone");
      if (!passage) f.block(f.cell(0, 2, 1)).setType("minecraft:oak_log");
      const before = snapshot(f, cells);
      const aim = await f.menu("shape", "stairs");
      check(
        aim.offered === true && aim.flow.kind === "stairAim",
        "stairs did not enter aiming",
      );
      check(
        (await f.menu("stairContents", contents)).offered === false,
        "contents offered before goal",
      );
      try {
        await f.edit(`aim ${goal.x} ${goal.y} ${goal.z}`);
        const fixed = await f.tap("block", goal);
        check(
          fixed.flow.kind === "stairContents",
          "press did not fix stair goal",
        );
        const built = await f.menu("stairContents", contents);
        check(
          built.offered === true &&
            built.message === "editDoneCount" &&
            built.count === (passage ? 66 : 15),
          `${contents} did not finish`,
        );
        const expected = new Map<string, boolean | "air">();
        for (let x = 0; x <= 2; x++)
          for (const [z, y, nose] of [
            [0, 0, true],
            [1, 1, true],
            [2, 1, false],
            [3, 2, true],
            [4, 2, false],
          ] as const) {
            expected.set(cellKey(f.cell(x, y, z)), nose);
            if (passage) {
              for (let below = 1; below < y; below++)
                expected.set(cellKey(f.cell(x, below, z)), false);
              for (let dy = 1; dy <= 3; dy++)
                expected.set(cellKey(f.cell(x, y + dy, z)), "air");
            }
          }
        const untouched: Cell[] = [];
        const untouchedBefore: typeof before = [];
        cells.forEach((cell, i) => {
          const nose = expected.get(cellKey(cell));
          if (nose === undefined) {
            const prior = before[i];
            check(prior !== undefined, "missing block snapshot");
            untouched.push(cell);
            untouchedBefore.push(prior);
            return;
          }
          const block = f.block(cell);
          if (nose === "air") {
            check(block.isAir, `headroom blocked at ${cellKey(cell)}`);
            return;
          }
          check(
            block.typeId === material &&
              block.permutation.getState("upside_down_bit") === !nose &&
              block.permutation.getState("weirdo_direction") === (nose ? 2 : 0),
            `incorrect stair at ${cellKey(cell)}`,
          );
        });
        check(
          unchanged(f, untouched, untouchedBefore),
          `${contents} changed a cell outside its plan`,
        );
        checkSelection(
          built,
          { min: f.cell(0, 2, 4), max: f.cell(2, 2, 4) },
          "Stair goal",
        );
        checkSelection(await f.edit("undo"), { min, max }, "Stair Undo");
        check(
          unchanged(f, cells, before),
          "Undo did not restore the stair cells",
        );
      } finally {
        await f.edit("aim clear");
      }
    }
  });
}

export function buildStairsSingle(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(5, 6, 3, f.cell(0, 0, -1));
    for (const cell of cells) f.block(cell).setType("minecraft:air");
    const foot = f.cell();
    f.block(foot).setType("minecraft:stone");
    await f.tap("block", foot);
    check(
      (await f.tap("block", foot)).flow.kind === "baseHeight",
      "same-cell taps skipped live height",
    );
    checkSelection(
      await f.tap("air"),
      { min: foot, max: foot },
      "Single-cell foot",
    );
    check(
      (await f.menu("shape", "stairs")).flow.kind === "stairAim",
      "single-cell foot did not enter stair aiming",
    );
    const hit = f.cell(4, 2, 1);
    const goal = f.cell(4, 2, 0);
    try {
      await f.edit(`aim ${hit.x} ${hit.y} ${hit.z}`);
      check(
        (await f.tap("block", hit)).flow.kind === "stairContents",
        "press did not fix the goal",
      );
      const built = await f.menu("stairContents", "stepsOnly");
      checkSelection(built, { min: goal, max: goal }, "Single-cell goal");
      for (const cell of cells) {
        const step =
          cell.z === foot.z &&
          cell.y === foot.y + Math.ceil((cell.x - foot.x) / 2);
        check(
          f.block(cell).typeId === (step ? "minecraft:stone" : "minecraft:air"),
          `incorrect one-wide staircase at ${cellKey(cell)}`,
        );
      }
      checkSelection(
        await f.edit("undo"),
        { min: foot, max: foot },
        "Single-cell Stairs Undo",
      );
      const aboveFoot = f.block(f.cell(0, 1, 0));
      const besideRow = f.block(f.cell(0, 1, 1));
      aboveFoot.setType("minecraft:stone");
      besideRow.setType("minecraft:stone");
      const aim = await f.menu("shape", "terrace");
      check(
        aim.offered === true && aim.flow.kind === "stairAim",
        "single-cell foot did not enter Terrace aiming",
      );
      check(
        (await f.tap("block", hit)).flow.kind === "stairContents",
        "Terrace did not fix the single-cell goal",
      );
      const terrace = await f.menu("terrace", "confirm");
      check(
        terrace.offered === true &&
          terrace.message === "editDoneCount" &&
          terrace.count === 1,
        "single-cell Terrace did not clear one block",
      );
      checkSelection(
        terrace,
        { min: goal, max: goal },
        "Single-cell Terrace goal",
      );
      check(aboveFoot.isAir, "single-cell Terrace left a block above the foot");
      check(
        besideRow.typeId === "minecraft:stone" &&
          f.block(foot).typeId === "minecraft:stone",
        "single-cell Terrace changed the foot or an adjacent column",
      );
      checkSelection(
        await f.edit("undo"),
        { min: foot, max: foot },
        "Single-cell Terrace Undo",
      );
      check(
        aboveFoot.typeId === "minecraft:stone",
        "Terrace Undo did not restore the cleared block",
      );
    } finally {
      await f.edit("aim clear");
    }
  });
}

export function buildStairRoofs(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const material = "minecraft:oak_stairs";
    const directionByDescent = { east: 1, west: 0, south: 3, north: 2 };
    const height = 3;
    for (const [kind, fill, sx, sz, expected] of [
      ["gable", "fill", 5, 7, 63],
      ["gable", "hollow", 6, 7, 54],
      ["hip", "hollow", 5, 5, 25],
    ] as const) {
      const label = `${kind} ${sx}x${sz} ${fill}`;
      const cells = f.region(sx, 4, sz);
      for (const cell of cells) f.block(cell).setType("minecraft:air");
      const min = f.cell();
      const end = f.cell(sx - 1, fill === "fill" ? 3 : 0, sz - 1);
      const first = f.block(min);
      first.setType(material);
      first.setPermutation(
        first.permutation
          .withState("weirdo_direction", 3)
          .withState("upside_down_bit", true),
      );
      await f.tap("block");
      await f.tap("air", end);
      checkSelection(await f.tap("fixHeight"), { min, max: end }, label);
      first.setType("minecraft:oak_log");
      first.setPermutation(first.permutation.withState("pillar_axis", "x"));
      const before = snapshot(f, cells);

      const step = (await f.menu("shape", kind)).flow;
      check(
        step.kind === "heightStep" &&
          step.heightLocked === true &&
          step.liveHeight === height,
        `${label}: expected locked height ${height}`,
      );
      check(
        (await f.edit("height 1")).flow.liveHeight === height,
        `${label}: height changed`,
      );
      const result = await f.menu("contents", fill);
      check(
        result.offered === true &&
          result.message === "editDoneCount" &&
          result.count === expected,
        `${label}: expected ${expected} reported placements, got ${result.count}`,
      );
      checkSelection(
        result,
        { min, max: f.cell(sx - 1, height - 1, sz - 1) },
        label,
      );
      check(
        f.count(cells, material) === expected,
        `${label}: stair count differs from ${expected}`,
      );

      const spec: RoofSpec = {
        base: cellBox(min, f.cell(sx - 1, 0, sz - 1)),
        kind,
        height,
        style: "stair",
      };
      for (const cell of roofCells(spec, fill === "hollow")) {
        const slope = roofSlopeAt(spec, cell);
        const ridge = slope.kind === "ridge";
        const direction = ridge ? 3 : directionByDescent[slope.descends];
        const block = f.block(cell);
        check(
          block.typeId === material &&
            block.permutation.getState("weirdo_direction") === direction &&
            block.permutation.getState("upside_down_bit") === ridge,
          `${label}: wrong stair permutation at ${cellKey(cell)}`,
        );
      }
      if (fill === "hollow") {
        for (let x = 1; x < sx - 1; x++) {
          for (let z = 1; z < sz - 1; z++) {
            check(
              f.block(f.cell(x, 0, z)).typeId === "minecraft:air",
              `${label}: bottom is closed at ${x},${z}`,
            );
          }
        }
      }
      checkSelection(await f.edit("undo"), { min, max: end }, `${label} Undo`);
      check(
        unchanged(f, cells, before),
        `${label}: Undo lost original block states`,
      );
      await f.tap("clear");
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
      "item switch did not clear the selection",
    );
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    await f.select(f.cell(4, 0, 4));
    check(
      (await f.menu("shape", "cancel")).flow.kind === "idle",
      "shape Cancel did not clear the selection",
    );
    await f.select(f.cell(4, 0, 4));
    await f.menu("shape", "gable");
    check(
      (await f.menu("contents", "cancel")).flow.kind === "point1",
      "roof Cancel did not resume aiming",
    );
  });
}

export function buildPersistentSelection(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const end = f.cell(4, 0, 4);
    for (const input of ["air", "block"] as const) {
      await f.tap("clear");
      f.block(f.cell()).setType("minecraft:stone");
      await f.tap("block");
      const base = await f.tap(input, end);
      check(
        base.flow.kind === "baseHeight" && base.menu === undefined,
        "fixing the second corner skipped live height or opened a menu",
      );
      const fixed = await f.tap("fixHeight");
      check(
        fixed.flow.kind === "selected" && fixed.menu === undefined,
        "fixing the height failed or opened a menu",
      );

      for (const [route, target] of [
        ["air", end],
        ["block", f.cell(1, 0, 1)],
        ["block", f.cell(8, 0, 8)],
      ] as const) {
        const opened = await f.tap(route, target);
        check(
          opened.menu?.map(({ id }) => id).join() ===
            "adjustHeight,cut,removeAbove,buildShape,copy,fillBelow,cancel",
          "selection menu missing",
        );
        const dismissed = await f.edit("menu shape");
        check(
          dismissed.offered === false &&
            JSON.stringify(dismissed.flow) === JSON.stringify(fixed.flow),
          "dismissal changed the selection",
        );
      }

      for (const type of [
        PASTE_ROTATE_TYPE,
        PASTE_PLACE_TYPE,
        BUILD_UNDO_TYPE,
      ]) {
        f.holdControl(type);
        await wait(BUILD_SPEC.modeLeaveTicks + 2);
        const mode = await f.mode();
        check(
          mode.mode === true &&
            JSON.stringify(mode.flow) === JSON.stringify(fixed.flow),
          `holding ${type} changed the selection`,
        );
      }
      f.hold(true);
      if (input === "air") {
        check(
          (await f.menu("shape", "cancel")).flow.kind === "idle",
          "Cancel did not clear the selection",
        );
      } else {
        f.holdControl("minecraft:stick");
        await wait(BUILD_SPEC.modeLeaveTicks + 2);
        const mode = await f.mode();
        check(
          mode.mode === false && mode.flow.kind === "idle",
          "holding a non-build item did not clear the selection",
        );
      }
    }
  });
}

function withTapTargetAim(
  a: Arena,
  touch: boolean,
  run: (
    f: Fixture,
    targets: () => ReturnType<Arena["dim"]["getEntities"]>,
  ) => Promise<void>,
): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const setTouch = (enabled: boolean) =>
      system.sendScriptEvent(
        TEST_INPUT_EVENT,
        JSON.stringify({ player: f.player.name, touch: enabled }),
      );
    const targets = () =>
      a.dim.getEntities({
        type: TAP_TARGET_TYPE,
        location: f.cell(),
        maxDistance: BUILD_SPEC.touchTapReach + 4,
      });
    setTouch(touch);
    try {
      const feet = f.cell(-3);
      f.block(f.cell(-3, -1)).setType("minecraft:stone");
      f.block(f.cell(0, 0, 3)).setType("minecraft:stone");
      f.player.teleport(cellCenter(feet), { dimension: a.dim });
      await f.lookSettled(-90, -5);
      await run(f, targets);
    } finally {
      setTouch(false);
      await wait(1);
    }
  });
}

async function setTapTargetStart(f: Fixture): Promise<void> {
  const start = await f.tap("block", f.cell(0, 0, 3));
  check(start.flow.kind === "point1", "first tap missing");
}

function aimedTapTargetCell(f: Fixture): Cell {
  check(
    !f.player.getBlockFromViewDirection({ maxDistance: BUILD_SPEC.reach }),
    "the tap target fixture must aim into air",
  );
  const cell = virtualEndPoint(
    f.cell(0, 0, 3),
    {
      origin: f.player.getHeadLocation(),
      direction: f.player.getViewDirection(),
    },
    BUILD_SPEC.touchTapReach,
    blockHeightRange(f.player.dimension),
  );
  check(cell !== undefined && f.block(cell).isAir, "no reachable air endpoint");
  return cell;
}

export function buildTapTargetFollows(a: Arena): Promise<Outcome> {
  return withTapTargetAim(a, true, async (f, targets) => {
    await setTapTargetStart(f);
    await wait(BUILD_SPEC.outlineInterval + 1);
    const first = aimedTapTargetCell(f);
    const [target, extra] = targets();
    check(
      target !== undefined &&
        extra === undefined &&
        distanceSq(target.location, cellCenter(first)) === 0,
      "expected one target at the first end marker",
    );
    const targetId = target.id;

    await f.lookSettled(-90, -35);
    await wait(BUILD_SPEC.outlineInterval + 1);
    const next = aimedTapTargetCell(f);
    check(
      !sameCell(first, next),
      "moving the aim did not change the marker cell",
    );
    const [moved, duplicate] = targets();
    check(
      moved?.id === targetId &&
        duplicate === undefined &&
        distanceSq(moved.location, cellCenter(next)) === 0,
      "expected the same single target at the moved end marker",
    );
  });
}

export function buildTapTargetCleanup(a: Arena): Promise<Outcome> {
  return withTapTargetAim(a, true, async (f, targets) => {
    await setTapTargetStart(f);
    await wait(BUILD_SPEC.outlineInterval + 1);
    check(targets().length === 1, "target missing before switching items");
    await f.switchItem();
    check(
      (await f.mode()).mode === false,
      "putting the wand away did not exit build mode",
    );
    check(
      targets().length === 0,
      "target lingered after putting away the wand",
    );

    await f.switchItem(true);
    await setTapTargetStart(f);
    await wait(BUILD_SPEC.outlineInterval + 1);
    check(
      targets().length === 1,
      "target missing before clearing the selection",
    );
    check(
      (await f.tap("clear")).flow.kind === "idle",
      "clearing did not return the flow to idle",
    );
    await wait(BUILD_SPEC.outlineInterval + 1);
    check(
      (await f.mode()).mode === true,
      "clearing unexpectedly exited build mode",
    );
    check(targets().length === 0, "target lingered in idle");
  });
}

export function buildTapTargetPointer(a: Arena): Promise<Outcome> {
  return withTapTargetAim(a, false, async (f, targets) => {
    await setTapTargetStart(f);
    await wait(BUILD_SPEC.outlineInterval + 1);
    check(
      f.player.inputInfo.lastInputModeUsed !== InputMode.Touch,
      "a pointer player is required",
    );
    aimedTapTargetCell(f);
    check(targets().length === 0, "a pointer player received a tap target");
  });
}

export function buildTapTargetPress(a: Arena): Promise<Outcome> {
  return withTapTargetAim(a, true, async (f, targets) => {
    const press = () =>
      system.sendScriptEvent(TEST_TAP_TARGET_EVENT, f.player.name);
    await setTapTargetStart(f);
    await wait(BUILD_SPEC.outlineInterval + 1);
    const cell = aimedTapTargetCell(f);
    const [target, extra] = targets();
    check(
      target !== undefined &&
        extra === undefined &&
        distanceSq(target.location, cellCenter(cell)) === 0,
      "expected one target at the aimed endpoint",
    );
    press();
    press();
    await wait(1);
    const base = (await f.mode()).flow;
    check(
      base.kind === "baseHeight" &&
        base.taps?.to !== undefined &&
        sameCell(base.taps?.to, cell),
      "the repeated press did not fix just the targeted endpoint",
    );

    await f.lookSettled(-90, -35);
    await wait(BUILD_SPEC.outlineInterval + 1);
    const raised = (await f.mode()).flow;
    check(
      raised.kind === "baseHeight" &&
        raised.liveHeight !== undefined &&
        raised.liveHeight > (base.liveHeight ?? 0),
      "looking up did not raise the live outline",
    );
    press();
    await wait(1);
    const fixed = (await f.mode()).flow;
    check(
      fixed.kind === "selected" &&
        fixed.selection?.box.max.y ===
          Math.min(f.cell().y, cell.y) + raised.liveHeight - 1,
      "the next target press did not confirm the live height",
    );
  });
}

export function buildLiveHeight(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    f.block(f.cell()).setType("minecraft:stone");
    const end = f.cell(4, 0, 4);
    f.block(end).setType("minecraft:stone");
    f.player.teleport(f.at(-6, 0, 2.5), { dimension: a.dim });
    await f.lookSettled(-90, 0);
    check((await f.tap("block")).flow.kind === "point1", "first tap missing");
    const base = await f.tap("block", end);
    check(
      base.flow.kind === "baseHeight" &&
        base.flow.liveHeight === 1 &&
        base.menu === undefined,
      "second tap did not start a one-layer live outline",
    );
    await f.lookSettled(-90, -30);
    await wait(BUILD_SPEC.outlineInterval);
    const raised = (await f.mode()).flow;
    check(
      raised.kind === "baseHeight" && (raised.liveHeight ?? 0) > 1,
      "looking up did not raise the live outline",
    );
    const fixed = await f.tap("air");
    const top = fixed.flow.selection?.box.max.y;
    check(
      fixed.flow.kind === "selected" &&
        fixed.menu === undefined &&
        raised.liveHeight !== undefined &&
        top === f.cell().y + raised.liveHeight - 1,
      "press did not fix the outlined height without a menu",
    );
    await f.lookSettled(-90, 0);
    await wait(BUILD_SPEC.outlineInterval);
    check(
      (await f.mode()).flow.selection?.box.max.y === top,
      "looking down moved the fixed outline",
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

async function startPasteStep(f: Fixture): Promise<Reply> {
  const copied = await f.menu("shape", "copy");
  check(copied.offered === true, "Copy absent");
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
  facing?: Facing,
): Promise<Reply> {
  return f.edit(
    `pasteat ${x} ${y} ${z} ${face} ${sneaking}${facing ? ` ${facing}` : ""}`,
  );
}

function capturePasteSource(
  f: Fixture,
  { min, max }: BoxBounds,
): Promise<Reply> {
  return f.edit(
    `structure ${min.x} ${min.y} ${min.z} ${max.x} ${max.y} ${max.z}`,
  );
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
    await checkState(f, "selected", true);
    check(
      unchanged(f, target.cells, expected),
      "Copy did not allow immediate Paste",
    );
    await f.edit("undo");
  });
}

export function buildPasteMenu(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (let i = 0; i < BUILD_SPEC.undoDepth; i++) {
      if ((await f.edit("undo")).message === "nothingToUndo") break;
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
    const box = { min: f.cell(), max: f.cell(1) };
    await f.edit(
      `snapshot ${box.min.x} ${box.min.y} ${box.min.z} ${box.max.x} ${box.max.y} ${box.max.z}`,
    );
    const withHistory = await checkState(f, "pasteAim", true);
    check(
      withHistory.pasteMenu.join() === "newCopy,endPaste,cancel",
      "Paste menu with history must have exactly three ordered entries",
    );
    await pasteInto(f, target);
    await checkState(f, "selected", true);
    await f.edit("undo");
    check(
      unchanged(f, target.cells, target.before),
      "Undo did not restore blocks",
    );
    check(
      (await f.state()).pasteMenu.join() === "newCopy,endPaste,cancel",
      "Paste menu changed after Undo",
    );
    await f.edit("undo");
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
    await f.tap("air", f.cell(1, 1, 1));
    await f.tap("fixHeight");
    await checkState(f, "selected", true);
    const expected = snapshot(f, source);
    await startPasteStep(f);
    await checkState(f, "pasteAim", true);
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 2, 2);
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "New copy did not replace the clipboard",
    );
    await f.edit("undo");
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

export function buildUndoItemPaste(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const expected = snapshot(f, f.region(2, 1, 1));
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    await pasteInto(f, target);
    await checkState(f, "selected", true);
    check(unchanged(f, target.cells, expected), "Paste did not write blocks");
    f.holdControl(BUILD_UNDO_TYPE);
    const undone = await f.press("blockInteract");
    check(undone.message === "undoDone", "Undo block tap did not finish");
    check(
      unchanged(f, target.cells, target.before),
      "Undo did not restore the area",
    );
    await checkState(f, "pasteAim", true);
    await pasteInto(f, target);
    await checkState(f, "selected", true);
    check(unchanged(f, target.cells, expected), "Re-paste lost the clipboard");
    await f.edit("undo");
  });
}

export function buildUndoItemShape(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(2, 2, 2);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await f.select(f.cell(1, 1, 1), false);
    const before = snapshot(f, cells);
    check(
      (await f.menu("shape", "fill")).message === "editDoneCount",
      "Fill failed",
    );
    check(f.count(cells) === cells.length, "Fill did not write the box");
    f.holdControl(BUILD_UNDO_TYPE);
    check(
      (await f.press("itemUse")).message === "undoDone",
      "Shape Undo failed",
    );
    check(unchanged(f, cells, before), "Shape Undo did not restore the box");
  });
}

export function buildUndoItemEnd(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const start = f.cell();
    f.block(start).setType("minecraft:stone");
    const material = snapshot(f, [start])[0] as BlockState;
    for (const line of [false, true]) {
      await f.tap("clear");
      check((await f.tap("block")).flow.kind === "point1", "Start tap failed");
      const wrong = f.cell(2, 0, line ? 0 : 2);
      const next = f.cell(4, 0, line ? 0 : 3);
      const endpoint = await f.tap("air", wrong);
      check(
        endpoint.flow.kind === (line ? "selected" : "baseHeight"),
        "End tap entered the wrong flow",
      );
      const { flow, message } = await f.edit("undoitem");
      check(
        message === "endCleared" && flow.kind === "point1",
        "End remained set",
      );
      check(flow.start !== undefined, "Start missing");
      check(sameCell(flow.start.cell, start), "Start moved");
      check(flow.start.dimensionId === a.dim.id, "Dimension changed");
      check(sameBlockState(flow.start.material, material), "Material changed");

      const picked = await f.tap("air", next);
      const selected = line ? picked : await f.tap("fixHeight");
      const actual = selected.flow.selection?.box;
      const expected = boxOf(start, next);
      check(
        selected.flow.kind === "selected" &&
          actual !== undefined &&
          sameCell(actual.min, expected.min) &&
          sameCell(actual.max, expected.max),
        "Re-picking the end did not select the new box",
      );
    }
  });
}

export function buildUndoItemStart(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    f.block(f.cell()).setType("minecraft:stone");
    check((await f.tap("block")).flow.kind === "point1", "Start tap failed");
    const { flow, message } = await f.edit("undoitem");
    check(
      message === "startCleared" && flow.kind === "idle",
      "Start remained set",
    );
  });
}

export function buildUndoItemAfterBuild(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 1, 1);
    for (const c of cells) f.block(c).setType("minecraft:air");
    await f.select(f.cell(2));
    const before = snapshot(f, cells);
    check(
      (await f.menu("shape", "place")).message === "editDoneCount",
      "Place failed",
    );
    check(f.count(cells) === cells.length, "Place did not write the line");
    check(
      (await f.edit("undoitem")).message === "undoDone",
      "Build Undo did not undo Place",
    );
    check(unchanged(f, cells, before), "Build Undo did not restore the line");
  });
}

export function buildUndoItemEmpty(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    f.holdControl(BUILD_UNDO_TYPE);
    check(
      (await f.press("blockInteract")).message === "nothingToUndo",
      "Empty history did not report nothingToUndo",
    );
    await checkState(f, "idle", false);
    // Remove the fixture's wand-created session to model a fresh player.
    f.hold(false);
    await wait(BUILD_SPEC.modeLeaveTicks + 4);
    await f.edit("reset absent");
    f.holdControl(BUILD_UNDO_TYPE);
    await wait(BUILD_SPEC.modeEnterTicks + BUILD_SPEC.pasteRepeatTicks);
    const before = await f.mode();
    check(
      before.mode === false && before.sessionPresent === false,
      "Undo alone entered build mode or created a session",
    );
    check(
      (await f.press("itemUse")).message === "nothingToUndo",
      "Fresh player Undo did not report nothingToUndo",
    );
    const after = await f.mode();
    check(
      after.mode === false && after.sessionPresent === false,
      "Undo press created a session or entered build mode",
    );
  });
}

export function buildUndoItemRoutesOnce(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const expected = snapshot(f, f.region(2, 1, 1));
    const first = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    const last = pasteTarget(f, f.cell(16, 0, 12), 2, 1, 1);
    await pasteInto(f, first);
    await copyLine(f);
    await pasteInto(f, last);
    check(
      unchanged(f, first.cells, expected) && unchanged(f, last.cells, expected),
      "Both pastes must exist before Undo",
    );
    f.holdControl(BUILD_UNDO_TYPE);
    check(
      (await f.press("blockInteract,itemUse")).message === "undoDone",
      "Combined routes did not undo",
    );
    check(unchanged(f, last.cells, last.before), "Last paste was not undone");
    check(
      unchanged(f, first.cells, expected),
      "One press undid more than one edit",
    );
    await f.edit("undo");
    check(
      unchanged(f, first.cells, first.before),
      "Earlier undo history was lost",
    );
  });
}

export function buildUndoItemKeepsPasteAim(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await copyLine(f);
    const expected = snapshot(f, f.region(2, 1, 1));
    const target = pasteTarget(f, f.cell(12, 0, 12), 2, 1, 1);
    f.holdControl(BUILD_UNDO_TYPE);
    await wait(BUILD_SPEC.modeLeaveTicks + 4);
    check((await f.mode()).mode === true, "Holding Undo left build mode");
    await checkState(f, "pasteAim", true);
    f.hold(true);
    await wait(BUILD_SPEC.modeEnterTicks + 2);
    await checkState(f, "pasteAim", true);
    await pasteInto(f, target);
    await checkState(f, "selected", true);
    check(
      unchanged(f, target.cells, expected),
      "Wand to Undo to wand lost the clipboard or aiming",
    );
    await f.edit("undo");
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
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "first Paste did not write blocks",
    );
    const undone = await f.edit("undo");
    check(undone.flow.kind === "pasteAim", "Undo did not resume aiming");
    check(
      unchanged(f, target.cells, target.before),
      "Undo did not restore blocks",
    );
    await pasteInto(f, target);
    check(
      unchanged(f, target.cells, expected),
      "same-anchor re-paste failed after Undo",
    );
    await checkState(f, "selected", true);
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
    for (const [face, dx, dy, dz] of [
      ["up", 0, 1, 0],
      ["down", 0, -1, 0],
      ["east", 1, 0, 0],
      ["west", -3, 0, 0],
      ["north", -2, 0, -1],
      ["south", 0, 0, 1],
    ] as const) {
      await f.select(f.cell(2));
      await startPasteStep(f);
      const anchor = f.cell(10, 2, 10);
      f.block(anchor).setType("minecraft:gold_block");
      const target = f.region(
        3,
        1,
        1,
        cellOf({
          x: anchor.x + dx,
          y: anchor.y + dy,
          z: anchor.z + dz,
        }),
      );
      // Air above solid ground keeps the snapped box at the aimed box (ADR 0203).
      for (const c of target) f.block(c).setType("minecraft:air");
      for (const c of target) {
        const ground = cellOf({ ...c, y: c.y - 1 });
        if (
          ground.x !== anchor.x ||
          ground.y !== anchor.y ||
          ground.z !== anchor.z
        )
          f.block(ground).setType("minecraft:stone");
      }
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
      check(pasted.message === "editDoneCount", "aimed paste failed");
      checkSelection(
        pasted,
        {
          min: cellOf({ x: anchor.x + dx, y: anchor.y + dy, z: anchor.z + dz }),
          max: cellOf({
            x: anchor.x + dx + 2,
            y: anchor.y + dy,
            z: anchor.z + dz,
          }),
        },
        `Paste on ${face}`,
      );
      if (face !== "up" && face !== "down")
        check(
          f.block(anchor).typeId === "minecraft:gold_block",
          "Side-face paste covered the aimed block",
        );
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
  // Paste snaps above the highest ground under its footprint, so an air bottom
  // layer over a solid footprint keeps the snapped box equal to the aimed box.
  for (const cell of f.region(sx, 1, sz, anchor))
    f.block(cell).setType("minecraft:gold_block");
  const cells = f.region(sx, sy, sz, cellOf({ ...anchor, y: anchor.y + 1 }));
  for (const cell of cells)
    f.block(cell).setType(
      cell.y === anchor.y + 1 ? "minecraft:air" : "minecraft:gold_block",
    );
  return { anchor, cells, before: snapshot(f, cells) };
}

export function buildCopyShapes(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [sy, sz] of [
      [3, 3],
      [3, 1],
      [1, 3],
    ] as const) {
      const source = f.region(3, sy, sz);
      mixedSource(f, source);
      await f.select(f.cell(2, sy - 1, sz - 1));
      // Kept blocks and air both count toward the inclusive box volume.
      f.block(f.cell(1)).setType("minecraft:chest");
      const copied = await startPasteStep(f);
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
  f.block(cellOf({ ...c, x: c.x - 1 })).setType("minecraft:stone");
  const frame = f.block(c);
  frame.setType("minecraft:frame");
  frame.setPermutation(frame.permutation.withState("facing_direction", 5));
}

export function buildPasteSelectsBox(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(3, 1, 1);
    mixedSource(f, source);
    await f.select(f.cell(2));
    const expected = snapshot(f, source);
    await startPasteStep(f);
    const target = pasteTarget(f, f.cell(20, 0, 12), 3, 1, 1);
    const pasted = await pasteStep(
      f,
      target.anchor.x,
      target.anchor.y,
      target.anchor.z,
      "up",
    );
    check(pasted.message === "editDoneCount", "Paste did not finish");
    checkSelection(
      pasted,
      { min: f.cell(20, 1, 12), max: f.cell(22, 1, 12) },
      "Pasted box",
    );
    check(unchanged(f, target.cells, expected), "Paste lost source states");
    await checkState(f, "selected", true);

    await holdPasteControl(f, PASTE_ROTATE_TYPE);
    await wait(BUILD_SPEC.modeLeaveTicks);
    check((await f.mode()).mode === true, "Paste Rotate left build mode");
    const rotated = await f.press("blockInteract,itemUse");
    check(rotated.message === "rotateDone", "Paste Rotate did not finish");
    checkSelection(
      rotated,
      { min: f.cell(21, 1, 11), max: f.cell(21, 1, 13) },
      "Rotated pasted box",
    );
    const log = f.block(f.cell(21, 1, 12));
    check(
      log.typeId === "minecraft:oak_log" &&
        log.permutation.getState("pillar_axis") === "z" &&
        f.block(f.cell(20, 1, 12)).isAir &&
        f.block(f.cell(22, 1, 12)).isAir,
      "Paste Rotate did not turn the blocks in place",
    );
    await checkState(f, "selected", true);
    check(
      (await f.edit("undo")).flow.kind === "selected",
      "Undo of rotation left the selection",
    );
    check(
      (await f.edit("undo")).flow.kind === "pasteAim",
      "Undo of paste did not resume aiming",
    );
    check(
      unchanged(f, target.cells, target.before),
      "Undo did not restore the paste destination",
    );
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
      pasted.message === "editDoneCount" && pasted.flow.kind === "selected",
      "clean Paste after refusal failed",
    );
    check(
      unchanged(f, clean.cells, expected),
      "clean Paste lost source states",
    );
    await f.edit("undo");
    check(
      unchanged(f, clean.cells, clean.before),
      "clean Paste undo lost destination states",
    );
    await endPasteStep(f);
  });
}

type BoxBounds = Pick<CellBox, "min" | "max">;

function checkSelection(reply: Reply, box: BoxBounds, detail: string): void {
  const actual = reply.flow.selection?.box;
  check(
    reply.flow.kind === "selected" &&
      reply.flow.menuLevel === "root" &&
      actual !== undefined &&
      sameCell(actual.min, box.min) &&
      sameCell(actual.max, box.max),
    `${detail}: expected root selection ${JSON.stringify(box)}, got ${JSON.stringify(reply.flow)}`,
  );
}

async function placeSolid(
  f: Fixture,
  end: Cell,
  shape: string,
  fill: string,
): Promise<Reply> {
  await f.select(end);
  f.block(f.cell()).setType("minecraft:air");
  const { flow } = await f.menu("shape", shape);
  const height = end.y - f.cell().y + 1;
  check(
    flow.kind === "heightStep" &&
      flow.heightLocked === true &&
      flow.liveHeight === height,
    `${shape} did not lock the selected height ${height}`,
  );
  const done = await f.menu("contents", fill);
  check(
    done.offered === true &&
      done.message === "editDoneCount" &&
      done.flow.kind === "selected" &&
      done.flow.menuLevel === "root",
    `${shape} ${fill} did not finish with a root selection`,
  );
  return done;
}

export function buildCylinderRect(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(7, 2, 7);
    for (const [fill, expected] of [
      ["fill", 37],
      ["hollow", 37],
      ["tube", 16],
    ] as const) {
      for (const c of cells) f.block(c).setType("minecraft:air");
      await placeSolid(f, f.cell(6, 0, 6), "cylinder", fill);
      check(
        f.count(cells) === expected,
        `flat cylinder ${fill}: expected ${expected}, got ${f.count(cells)}`,
      );
      await f.edit("undo");
      check(f.count(cells) === 0, `flat cylinder ${fill} undo left blocks`);
    }
  });
}

export function buildCylinderSelection(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const c of f.region(8, 3, 2)) f.block(c).setType("minecraft:air");
    const done = await placeSolid(f, f.cell(7, 2, 1), "cylinder", "fill");
    checkSelection(done, { min: f.cell(1), max: f.cell(6, 2, 1) }, "cylinder");
    await f.edit("undo");
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
        step.flow.kind === "heightStep" && step.flow.liveHeight === 5,
        "box cylinder did not lock the height to the box",
      );
      check(
        (await f.edit("height 2")).flow.liveHeight === 5,
        "locked cylinder height changed",
      );
      const done = await f.menu("contents", fill);
      check(done.message === "editDoneCount", `box cylinder ${fill} failed`);
      checkSelection(
        done,
        { min: f.cell(), max: f.cell(4, 4, 4) },
        "box cylinder",
      );
      const stone = (x: number, y: number, z: number) =>
        f.block(f.cell(x, y, z)).typeId === "minecraft:stone";
      check(stone(0, 1, 2) && stone(4, 2, 2), `cylinder ${fill} wall missing`);
      check(!stone(0, 1, 0), `cylinder ${fill} filled a corner`);
      check(
        stone(2, 0, 2) === (fill !== "tube") &&
          stone(2, 4, 2) === (fill !== "tube") &&
          stone(2, 2, 2) === (fill === "fill"),
        `cylinder ${fill} inside layers wrong`,
      );
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
          step.flow.kind === "heightStep" && step.flow.liveHeight === size[1],
          "box sphere did not lock the height to the box",
        );
        check(
          (await f.edit("height 2")).flow.liveHeight === size[1],
          "locked sphere height changed",
        );
        const done = await f.menu("contents", fill);
        check(done.message === "editDoneCount", `box sphere ${fill} failed`);
        checkSelection(done, { min: f.cell(), max: end }, "box sphere");
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
    await placeSolid(f, f.cell(4, 0, 4), "sphere", "fill");
    check(
      f.count(cells) === 21,
      `rect sphere: expected 21, got ${f.count(cells)}`,
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
    const done = await f.menu("contents", "hollow");
    checkSelection(
      done,
      { min: f.cell(), max: f.cell(6, 6, 6) },
      "hollow sphere",
    );
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
      ["fill", 16],
      ["hollow", 16],
      ["tube", 12],
    ] as const) {
      for (const c of cells) f.block(c).setType("minecraft:air");
      await placeSolid(f, f.cell(3, 0, 3), "cube", fill);
      check(
        f.count(cells) === expected,
        `cube ${fill}: expected ${expected}, got ${f.count(cells)}`,
      );
      await f.edit("undo");
      check(f.count(cells) === 0, `cube ${fill} undo left blocks`);
    }
    await placeSolid(f, f.cell(3, 2, 3), "cube", "fill");
    check(f.count(cells) === 48, "cube did not fill the selected box");
    await f.edit("undo");
  });
}

export function buildSolidCancelUndo(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(8, 3, 2);
    for (const c of cells) f.block(c).setType("minecraft:air");
    const flatEnd = f.cell(7, 0, 1);
    await f.select(flatEnd);
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
      await f.tap("air", flatEnd);
      await f.tap("fixHeight");
    }
    const end = f.cell(7, 2, 1);
    const built = await placeSolid(f, end, "cylinder", "fill");
    checkSelection(built, { min: f.cell(1), max: f.cell(6, 2, 1) }, "cylinder");
    check(f.count(cells) > 0, "cylinder was not built");
    f.holdControl(BUILD_UNDO_TYPE);
    const undone = await f.press("itemUse");
    check(undone.message === "undoDone", "Build Undo did not run");
    checkSelection(undone, { min: f.cell(), max: end }, "cylinder Undo");
    check(f.count(cells) === 0, "undo did not remove the cylinder");
  });
}

export function buildCutShapes(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    for (const [sx, sy, sz] of [
      [5, 1, 1],
      [3, 1, 3],
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
          cut.message === "editDoneCount" &&
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
    const outside = surround.filter((c) => !cells.some((s) => sameCell(s, c)));
    const before = snapshot(f, outside);
    await f.select(f.cell(2, 2, 2));
    const cut = await f.menu("shape", "cut");
    check(
      cut.message === "editDoneCount" &&
        cut.count === cells.length &&
        cut.flow.kind === "pasteAim",
      "Cut did not clear the selected three layers immediately",
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
      (await f.menu("shape", "cut")).message === "editDoneCount",
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
  const undo = await f.edit("undo");
  check(
    undo.message === "undoDone" && undo.count === volume,
    `Cut Undo reported ${undo.message} ${undo.count}`,
  );
}

async function pasteCutClipboard(
  f: Fixture,
  anchor: Cell,
  volume: number,
  sx: number,
  sy: number,
  sz: number,
): Promise<void> {
  for (const cell of f.region(sx, sy, sz, anchor))
    f.block(cell).setType("minecraft:air");
  for (const cell of f.region(
    sx,
    1,
    sz,
    cellOf({ ...anchor, y: anchor.y - 1 }),
  ))
    f.block(cell).setType("minecraft:stone");
  const pasted = await pasteStep(f, anchor.x, anchor.y - 1, anchor.z, "up");
  check(
    pasted.message === "editDoneCount" &&
      pasted.count === volume &&
      pasted.flow.kind === "selected",
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
        (await f.menu("shape", "cut")).message === "editDoneCount",
        "Structure cut failed",
      );
      await wait(5);
      check(
        source.every((c) => f.block(c).isAir),
        "Cut left source blocks or frame",
      );
      check(entities().length === 0, "Cut left entities or dropped items");
      await pasteCutClipboard(f, f.cell(12), source.length, 8, 4, 8);
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
      await f.switchItem();
    }
  });
}

/** Footprint columns from a layer below the fixture's origin up to the world top. */
function columnRegion(f: Fixture, sx: number, sz: number, bottom: number) {
  const offset = f.cell(0, bottom, 0);
  return f.region(
    sx,
    blockHeightRange(f.player.dimension).maxY - offset.y + 1,
    sz,
    offset,
  );
}

export function buildRemoveAbove(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = columnRegion(f, 3, 3, -3);
    for (const cell of cells) f.block(cell).setType("minecraft:air");
    const ceiling = f.block(
      cellOf({
        ...f.cell(1, 0, 1),
        y: blockHeightRange(a.dim).maxY,
      }),
    );
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
        done.message === "editDoneCount",
        `Remove above did not finish: ${done.message}`,
      );
      checkSelection(
        done,
        { min: f.cell(0, -3, 0), max: f.cell(2, 0, 2) },
        "Remove above",
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
      refused.message === "tooLarge" && refused.flow.kind === "selected",
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
      (await f.menu("shape", "place")).message === "editDoneCount",
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
      (await f.menu("shape", "cut")).message === "editDoneCount",
      "Cut with clipboard failed",
    );
    const after = await checkState(f, "pasteAim", true);
    check(f.count(cells, "minecraft:air") === 3, "Cut kept source blocks");
    check(
      after.clipboard?.contents.kind === "structure",
      "Cut clipboard is not a structure",
    );
    const target = f.region(3, 1, 1, f.cell(12, 0, 12));
    await pasteCutClipboard(f, f.cell(12, 0, 12), cells.length, 3, 1, 1);
    check(unchanged(f, target, before), "Cut payload lost block states");
    await undoCut(f, cells.length);
    await undoCut(f, cells.length);
    await f.menu("paste", "endPaste");
  });
}

export function buildSelectedLineFeedback(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    const cells = f.region(2, 1, 1);

    for (const cell of cells) f.block(cell).setType("minecraft:gold_block");
    await f.select(f.cell(1));
    f.block(f.cell()).setType("minecraft:gold_block");
    const result = await f.menu("shape", "place");
    check(
      result.message === "editDoneCount" && result.count === 2,
      "Edit feedback missing",
    );
    check(result.undoHints === 0, "Selected line promised air-press Undo");
    const undo = await f.menu("utility", "undo");
    check(
      undo.message === "undoDone" && undo.undoHints === 0,
      "Undo emitted first-edit hint",
    );
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
    f.player.teleport(cellCenter(feet));
    const rotation = f.player.getRotation();
    const result = await f.menu("shape", "fill");
    check(result.message === "editDoneCount", "Fill did not complete");
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
    f.block(cellOf({ ...feet, y: feet.y + 1 })).setPermutation(
      f.block(feet).permutation.withState("upper_block_bit", true),
    );
    await f.select(f.cell(2, 3, 2));
    f.player.teleport(cellCenter(feet));
    const result = await f.menu("shape", "fill");
    check(result.message === "editDoneCount", "Remote Fill did not complete");
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
    checkSelection(done, { min: f.cell(), max: f.cell(4, 0, 4) }, "Fill below");
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
    await f.tap("fixHeight");
    const refused = await f.menu("shape", "fillBelow");
    check(
      refused.message === "fillMaterialRefused" &&
        refused.flow.kind === "selected",
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
    f.player.teleport(cellCenter(feet));
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
      const end = at(6, 4, 4);
      await f.select(end);
      f.block(f.cell()).setType("minecraft:air");
      await f.lookSettled(axis === "x" ? -90 : 0);
      const step = await f.menu("shape", "sideCylinder");
      const expectedKind = axis === "x" ? "sideCylinderX" : "sideCylinderZ";
      check(
        step.flow.heightedKind === expectedKind,
        `sideways cylinder picked ${step.flow.heightedKind} instead of ${expectedKind}`,
      );
      check(
        step.offered === true && step.flow.kind === "heightStep",
        "sideways cylinder step missing",
      );
      await f.lookSettled(axis === "x" ? 0 : -90);
      check(
        step.flow.heightLocked === true &&
          (await f.edit("height 2")).flow.liveHeight === 5,
        "sideways cylinder height was not locked",
      );
      const done = await f.menu("contents", fill);
      const n = f.count(cells);
      check(
        done.message === "editDoneCount" && n === expected,
        `sideways ${axis} ${fill} count incorrect: got ${n}, expected ${expected}, kind ${step.flow.heightedKind}`,
      );
      checkSelection(done, { min: f.cell(), max: end }, "sideways cylinder");
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
    const surround = f.region(11, 3, 11, f.cell(11, 0, 7));
    const ground = f.region(11, 1, 11, f.cell(11, -1, 7));
    try {
      for (const c of source)
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
        ?.setText("Rotate front", SignSide.Front);
      sign
        .getComponent("minecraft:sign")
        ?.setText("Rotate back", SignSide.Back);
      await f.lookSettled(-90);
      await f.select(f.cell(4, 2, 2));
      check(
        (await f.menu("shape", "copy")).flow.kind === "pasteAim",
        "Copy did not start paste aiming",
      );
      check(
        (await f.state()).clipboard?.facing === "east",
        "Copy did not record east",
      );
      for (const [facing, gazeTurn, yaw] of [
        ["south", 1, 0],
        ["west", 2, 90],
        ["north", 3, 180],
        ["east", 0, -90],
      ] as const) {
        await f.lookSettled(yaw);
        for (const manualTurn of [0, 1, 2, 3]) {
          const turn = (gazeTurn + manualTurn) % 4;
          const footprint = (
            [
              [5, 3, 1, 1, 3, 1],
              [3, 5, 1, 1, 1, 3],
              [5, 3, 3, 1, 1, 1],
              [3, 5, 1, 3, 1, 1],
            ] as const
          )[turn];
          if (!footprint) throw new Error("Missing paste footprint");
          const [width, depth, chestX, chestZ, signX, signZ] = footprint;
          const minX =
            facing === "south" || facing === "west" ? 17 - width : 16;
          const minZ =
            facing === "west" || facing === "north" ? 13 - depth : 12;
          const label = `${facing} with manual turn ${manualTurn}`;
          const target = f.region(width, 3, depth, f.cell(minX, 0, minZ));
          for (const c of surround) {
            f.block(c)
              .getComponent("minecraft:inventory")
              ?.container?.clearAll();
            f.block(c).setType("minecraft:gold_block");
          }
          for (const c of target) f.block(c).setType("minecraft:air");
          for (const c of ground) f.block(c).setType("minecraft:stone");
          const anchor = f.cell(16, -1, 12);
          check(
            (
              await f.edit(
                `pasteat ${anchor.x} ${anchor.y} ${anchor.z} up true ${facing} ${manualTurn}`,
              )
            ).message === "editDoneCount",
            `Paste failed facing ${label}`,
          );
          for (const c of target) {
            const x = c.x - f.cell(minX).x;
            const y = c.y - f.cell().y;
            const z = c.z - f.cell(0, 0, minZ).z;
            const expected =
              y === 0
                ? "minecraft:stone"
                : y === 1 && x === chestX && z === chestZ
                  ? "minecraft:chest"
                  : y === 1 && x === signX && z === signZ
                    ? "minecraft:standing_sign"
                    : "minecraft:air";
            check(
              f.block(c).typeId === expected,
              `Footprint mismatch facing ${label}`,
            );
          }
          const outside = surround.filter(
            (c) => !target.some((t) => t.x === c.x && t.z === c.z),
          );
          check(
            f.count(outside, "minecraft:gold_block") === outside.length,
            `Paste changed cells outside the ${label} footprint`,
          );
          const item = f
            .block(f.cell(minX + chestX, 1, minZ + chestZ))
            .getComponent("minecraft:inventory")
            ?.container?.getItem(0);
          check(
            item?.typeId === "minecraft:diamond" && item.amount === 7,
            `Chest lost items facing ${label}`,
          );
          const pastedSign = f
            .block(f.cell(minX + signX, 1, minZ + signZ))
            .getComponent("minecraft:sign");
          check(
            pastedSign?.getText(SignSide.Front) === "Rotate front" &&
              pastedSign.getText(SignSide.Back) === "Rotate back",
            `Sign lost text facing ${label}`,
          );
          check(
            (await f.edit("undo")).flow.kind === "pasteAim",
            `Undo did not resume aiming for ${label}`,
          );
        }
      }
    } finally {
      await f.edit("releaseStructures");
      for (const c of [...source, ...surround, ...ground]) {
        f.block(c).getComponent("minecraft:inventory")?.container?.clearAll();
        f.block(c).setType("minecraft:air");
      }
    }
  });
}

function placeControlFurniture(f: Fixture, source: Cell[]): void {
  for (const c of source)
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
  sign.getComponent("minecraft:sign")?.setText("Rotate front", SignSide.Front);
  sign.getComponent("minecraft:sign")?.setText("Rotate back", SignSide.Back);
}

async function copyControlSource(f: Fixture, source: Cell[]): Promise<void> {
  placeControlFurniture(f, source);
  await f.lookSettled(-90);
  await f.select(f.cell(4, 2, 2));
  check(
    (await f.menu("shape", "copy")).flow.kind === "pasteAim",
    "Copy did not start paste aiming",
  );
  check(
    (await f.state()).clipboard?.facing === "east",
    "Copy did not record east",
  );
}

async function holdPasteControl(f: Fixture, typeId: string): Promise<void> {
  f.holdControl(typeId);
  await wait(BUILD_SPEC.modeEnterTicks + 2);
}

async function releaseControlFixture(f: Fixture, cells: Cell[]): Promise<void> {
  try {
    await f.edit("releaseStructures");
  } finally {
    for (const c of cells) {
      f.block(c).getComponent("minecraft:inventory")?.container?.clearAll();
      f.block(c).setType("minecraft:air");
    }
  }
}

async function aimControlTarget(
  f: Fixture,
  ground: Cell[],
  air: Cell[],
): Promise<void> {
  for (const c of ground) f.block(c).setType("minecraft:stone");
  for (const c of air) f.block(c).setType("minecraft:air");
  const anchor = f.cell(16, -1, 12);
  f.player.teleport({
    x: anchor.x + 0.5 - 4,
    y: anchor.y + 1,
    z: anchor.z + 0.5,
  });
  await wait(4);
  const head = f.player.getHeadLocation();
  const distance = Math.hypot(
    head.x - (anchor.x + 0.5),
    head.z - (anchor.z + 0.5),
  );
  const pitch = (Math.atan2(head.y - (anchor.y + 1), distance) * 180) / Math.PI;
  await f.lookSettled(-90, pitch);
  const hit = f.player.getBlockFromViewDirection({
    maxDistance: BUILD_SPEC.reach,
  });
  check(
    !!hit &&
      sameCell(cellOf(hit.block.location), anchor) &&
      hit.face === Direction.Up,
    `Expected anchor ${JSON.stringify(anchor)} Up; hit ${hit ? `${JSON.stringify(hit.block.location)} ${hit.face} ${hit.block.typeId}` : "nothing"}`,
  );
}

function checkRotatedFurniture(f: Fixture, target: Cell[], min: Cell): void {
  for (const c of target) {
    const x = c.x - min.x;
    const y = c.y - min.y;
    const z = c.z - min.z;
    const expected =
      y === 0
        ? "minecraft:stone"
        : y === 1 && x === 1 && z === 1
          ? "minecraft:chest"
          : y === 1 && x === 1 && z === 3
            ? "minecraft:standing_sign"
            : "minecraft:air";
    check(
      f.block(c).typeId === expected,
      `Rotated footprint mismatch at ${JSON.stringify(c)}: expected ${expected}, got ${f.block(c).typeId}`,
    );
  }
  checkFurniturePayload(
    f,
    cellOf({ x: min.x + 1, y: min.y + 1, z: min.z + 1 }),
    cellOf({ x: min.x + 1, y: min.y + 1, z: min.z + 3 }),
  );
}

function checkFurniturePayload(f: Fixture, chest: Cell, signCell: Cell): void {
  const item = f
    .block(chest)
    .getComponent("minecraft:inventory")
    ?.container?.getItem(0);
  check(
    item?.typeId === "minecraft:diamond" && item.amount === 7,
    "Control paste lost chest items",
  );
  const sign = f.block(signCell).getComponent("minecraft:sign");
  check(
    sign?.getText(SignSide.Front) === "Rotate front" &&
      sign.getText(SignSide.Back) === "Rotate back",
    "Control paste lost sign text",
  );
}

export function buildRotateSelection(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const union = f.region(5, 3, 5, f.cell(0, 0, -1));
    try {
      for (const c of union) f.block(c).setType("minecraft:air");
      placeControlFurniture(f, f.region(5, 3, 3));
      const end = f.cell(4, 2, 2);
      await f.select(end);
      const before = snapshot(f, union);
      await holdPasteControl(f, PASTE_ROTATE_TYPE);
      const rotated = await f.press("blockInteract,itemUse");
      const min = f.cell(1, 0, -1);
      check(
        rotated.flow.kind === "selected" &&
          rotated.message === "rotateDone" &&
          JSON.stringify(rotated.flow.selection?.box) ===
            JSON.stringify({ min, max: f.cell(3, 2, 3) }),
        "Paste Rotate did not select the rotated footprint",
      );
      checkRotatedFurniture(f, f.region(3, 3, 5, min), min);
      await holdPasteControl(f, BUILD_UNDO_TYPE);
      const undone = await f.press("itemUse");
      check(
        undone.flow.kind === "selected" &&
          undone.message === "undoDone" &&
          JSON.stringify(undone.flow.selection?.box) ===
            JSON.stringify({ min: f.cell(), max: end }),
        "Build Undo did not restore the original selection",
      );
      check(unchanged(f, union, before), "Undo did not restore the union");
      checkFurniturePayload(f, f.cell(1, 1, 1), f.cell(3, 1, 1));
    } finally {
      await releaseControlFixture(f, union);
    }
  });
}

export function buildRotateTappedSpan(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const cells = f.region(3, 2, 3);
    const min = f.cell();
    const max = f.cell(2, 1, 2);
    try {
      for (const c of cells) f.block(c).setType("minecraft:stone");
      f.block(min).setType("minecraft:gold_block");
      f.block(max).setType("minecraft:diamond_block");
      await f.tap("block", min);
      check(
        (await f.tap("block", max)).flow.kind === "baseHeight",
        "Expected live height after the second tap",
      );
      f.player.teleport(f.at(-6, 0, 1.5), { dimension: a.dim });
      await f.lookSettled(-90, -30);
      await holdPasteControl(f, PASTE_ROTATE_TYPE);
      const live = (await f.mode()).flow;
      check(
        live.kind === "baseHeight" && (live.liveHeight ?? 0) > 2,
        "Expected the gaze above the tapped span",
      );
      const turned = await f.press("itemUse");
      check(turned.message === "rotateDone", "Expected rotation to finish");
      checkSelection(turned, { min, max }, "Two tapped layers after rotation");
      for (const c of cells) {
        const expected = sameCell(c, f.cell(2, 0, 0))
          ? "minecraft:gold_block"
          : sameCell(c, f.cell(0, 1, 2))
            ? "minecraft:diamond_block"
            : "minecraft:stone";
        check(
          f.block(c).typeId === expected,
          `Expected ${expected} at ${cellKey(c)} after a clockwise turn`,
        );
      }
    } finally {
      await releaseControlFixture(f, cells);
    }
  });
}

export function buildPasteControlInactive(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    await f.edit("reset");
    const cells = f.region(3, 2, 3, f.cell(16, 0, 12));
    for (const c of cells) f.block(c).setType("minecraft:stone");
    const before = snapshot(f, cells);
    for (const item of [PASTE_ROTATE_TYPE, PASTE_PLACE_TYPE]) {
      for (const route of ["itemUse", "blockInteract"]) {
        await holdPasteControl(f, item);
        const reply = await f.press(route);
        check(
          reply.message === "pasteInactive",
          `${item} ${route} did not show pasteInactive`,
        );
        const state = await f.state();
        check(
          state.flow === "idle" && !state.clipboardHeld,
          `${item} ${route} changed the inactive session`,
        );
        check(unchanged(f, cells, before), `${item} ${route} changed blocks`);
        await wait(BUILD_SPEC.pasteRepeatTicks + 2);
      }
    }
  });
}

export function buildPasteRotationDisplay(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(5, 3, 3);
    try {
      await copyControlSource(f, source);
      check(
        (await f.edit("aim east")).pasteReadyDegrees === 0,
        "Copy did not show zero degrees with matching facing",
      );
      await holdPasteControl(f, PASTE_ROTATE_TYPE);
      for (const degrees of [90, 180, 270, 0]) {
        const reply = await f.press("blockInteract");
        check(
          reply.pasteReadyDegrees === degrees,
          `Paste Rotate showed ${reply.pasteReadyDegrees}, expected ${degrees}`,
        );
        await wait(BUILD_SPEC.rotateDebounceTicks + 2);
      }
      await f.edit("aim clear");
      f.hold(true);
      await copyControlSource(f, source);
      check(
        (await f.edit("aim south")).pasteReadyDegrees === 90,
        "A quarter-turn gaze change did not show 90 degrees before pressing",
      );
    } finally {
      await f.edit("aim clear");
      await releaseControlFixture(f, source);
    }
  });
}

export function buildPasteControlRotate(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(5, 3, 3);
    try {
      await copyControlSource(f, source);
      await holdPasteControl(f, PASTE_ROTATE_TYPE);
      const start = (await f.state()).pasteTurn;
      for (let turn = 1; turn <= 4; turn++) {
        await f.press("blockInteract");
        check(
          (await f.state()).pasteTurn === (start + turn) % 4,
          `Control rotation ${turn} did not advance one quarter turn`,
        );
        if (turn < 4) await wait(BUILD_SPEC.pasteRepeatTicks + 2);
      }
    } finally {
      await releaseControlFixture(f, source);
    }
  });
}

async function pasteControlOnce(
  a: Arena,
  bothRoutes: boolean,
): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(5, 3, 3);
    const ground = f.region(15, 1, 11, f.cell(8, -1, 8));
    const air = f.region(15, 4, 11, f.cell(8, 0, 8));
    const target = f.region(3, 3, 5, f.cell(16, 0, 12));
    try {
      await copyControlSource(f, source);
      await aimControlTarget(f, ground, air);
      await holdPasteControl(f, PASTE_ROTATE_TYPE);
      const start = (await f.state()).pasteTurn;
      check(
        start === 0,
        "East-facing control paste did not start at turn zero",
      );
      await f.press(bothRoutes ? "itemUse,blockInteract" : "blockInteract");
      check(
        (await f.state()).pasteTurn === (start + 1) % 4,
        "Control routes did not rotate exactly once",
      );
      await wait(BUILD_SPEC.pasteRepeatTicks + 2);
      await holdPasteControl(f, PASTE_PLACE_TYPE);
      const placed = await f.press(
        bothRoutes ? "itemUse,blockInteract" : "blockInteract,blockInteract",
        bothRoutes ? 0 : 3,
      );
      check(placed.message === "editDoneCount", "Control paste did not finish");
      checkRotatedFurniture(f, target, f.cell(16, 0, 12));
      checkSelection(
        placed,
        { min: f.cell(16, 0, 12), max: f.cell(18, 2, 16) },
        "Control paste box",
      );
      await checkState(f, "selected", true);
      check(
        (await f.edit("undo")).message === "undoDone",
        "Control paste Undo failed",
      );
      check(
        f.count(target, "minecraft:air") === target.length,
        "One Undo did not restore air: control routes pasted more than once",
      );
    } finally {
      await releaseControlFixture(f, [...source, ...ground, ...air]);
    }
  });
}

export function buildPasteControlPlace(a: Arena): Promise<Outcome> {
  return pasteControlOnce(a, false);
}

export function buildPasteControlReaim(a: Arena): Promise<Outcome> {
  return withBuilder(a, async (f) => {
    const source = f.region(2, 1, 1);
    const ground = f.region(15, 1, 11, f.cell(8, -1, 8));
    const air = f.region(15, 4, 11, f.cell(8, 0, 8));
    try {
      await copyLine(f);
      await f.menu("paste", "newCopy");
      await f.select(f.cell(0, 0, 1));
      await checkState(f, "selected", true);
      await aimControlTarget(f, ground, air);
      await holdPasteControl(f, PASTE_PLACE_TYPE);
      const resumed = await f.press("itemUse");
      check(
        resumed.flow.kind === "pasteAim" &&
          resumed.message === "pasteChoosePosition",
        "First Place did not resume aiming with the position prompt",
      );
      check(
        f.count(air, "minecraft:air") === air.length,
        "First Place wrote blocks",
      );
      await wait(BUILD_SPEC.pasteRepeatTicks + 2);
      const placed = await f.press("itemUse");
      check(placed.message === "editDoneCount", "Second Place did not finish");
      check(
        f.block(f.cell(16, 0, 12)).typeId === "minecraft:stone" &&
          f.block(f.cell(17, 0, 12)).typeId === "minecraft:oak_log",
        "Second Place did not paste the copied line",
      );
    } finally {
      await releaseControlFixture(f, [...source, ...ground, ...air]);
    }
  });
}

export function buildPasteControlRoutesOnce(a: Arena): Promise<Outcome> {
  return pasteControlOnce(a, true);
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
      for (const c of source)
        f.block(c).setType(
          c.y === f.cell().y ? "minecraft:stone" : "minecraft:air",
        );
      for (const c of target) f.block(c).setType("minecraft:air");
      for (const c of f.region(8, 1, 4, f.cell(12, -1)))
        f.block(c).setType("minecraft:stone");
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
        const cow = f.at(offset + 6.5, 1, 2.5);
        a.dim.runCommand(`summon minecraft:cow ${cow.x} ${cow.y} ${cow.z}`);
      }
      const oldCow = inside(12).find((e) => e.typeId === "minecraft:cow");
      check(!!oldCow, "missing target cow");
      const min = f.cell();
      const max = f.cell(7, 3, 3);
      await capturePasteSource(f, { min, max });
      const anchor = f.cell(12, -1);
      const pasted = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
      check(
        pasted.message === "editDoneCount" && pasted.count === source.length,
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
      // The pasted stone layer lifts the snapped box by one; clearing it would
      // pop the pasted sign, and the bed lies inside both boxes anyway.
      f.block(f.cell(19, 3, 3)).setType("yasu_ride:camper_bed");
      const before = snapshot(f, target);
      const cowIds = inside(12)
        .map((e) => e.id)
        .sort()
        .join(",");
      await capturePasteSource(f, { min, max });
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
      const inside = (p: Vec3, offset: number, margin = 0) => {
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
          interacted.add(cellKey(cellOf(event.block.location)));
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
        for (const c of source)
          f.block(c).setType(
            c.y === f.cell().y ? "minecraft:stone" : "minecraft:air",
          );
        for (const c of target) f.block(c).setType("minecraft:air");
        for (const c of f.region(8, 1, 8, f.cell(12, -1)))
          f.block(c).setType("minecraft:stone");
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
        f.player.teleport(f.at(4.5, 1, 3.5), {
          dimension: a.dim,
          facingLocation: f.at(1, 2, 3.5),
        });
        const prompt =
          "Structure paste decor check: within 60 seconds, place the item frame on the stone wall, put the diamond into it, and hang the painting on the wall.";
        f.player.sendMessage(prompt);
        f.player.onScreenDisplay.setActionBar(prompt);
        onStep?.(setupPromptStep());
        let elapsed = 0;
        let setup = setupState();
        for (
          ;
          elapsed < SETUP_LIMIT_TICKS && setup.missing.length > 0;
          elapsed += SETUP_POLL_TICKS
        ) {
          await wait(SETUP_POLL_TICKS);
          setup = setupState();
          // The player setup window exceeds the runner's 60-second stall watch.
          if ((elapsed + SETUP_POLL_TICKS) % SETUP_REPORT_TICKS === 0)
            onStep?.(
              setupProgressStep(elapsed + SETUP_POLL_TICKS, setup.missing),
            );
        }
        const cell = setup.frame;
        if (!cell || setup.missing.length > 0) {
          record("setup", false, setupTimeoutDetail(elapsed, setup.missing));
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
        await capturePasteSource(f, { min, max });
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
        const mirrored = cellOf({ ...cell, x: cell.x + 12 });
        f.block(mirrored).setPermutation(permutation);
        const anchor = f.cell(12, -1);
        const pasted = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
        record(
          "paste",
          pasted.message === "editDoneCount" && pasted.count === source.length,
          pasted.message,
        );
        await wait(2);
        const pastedFrames = frames(target);
        const mirroredType = f.block(mirrored).typeId;
        let frameDetail = `frames=${pastedFrames.length};mirroredType=${mirroredType};mirrored=${mirrored.x},${mirrored.y},${mirrored.z}`;
        if (pastedFrames.length !== 1)
          frameDetail += `;frameCells=${pastedFrames.map(cellKey).join(";")}`;
        record(
          "item_frame_block",
          pastedFrames.length === 1 && mirroredType === "minecraft:frame",
          frameDetail,
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
        await capturePasteSource(f, { min, max });
        f.block(mirrored).setPermutation(permutation);
        for (const c of f.region(8, 1, 8, f.cell(12)))
          f.block(c).setType("minecraft:air");
        const repeated = await pasteStep(f, anchor.x, anchor.y, anchor.z, "up");
        record(
          "paste_repeat",
          repeated.message === "editDoneCount" &&
            repeated.count === source.length,
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
    check(
      (await f.menu("shape", "cut")).message === "editDoneCount",
      "Cut failed",
    );
    check(
      f.count(source, "minecraft:air") === source.length,
      "Cut left blocks",
    );
    const [first, ...remaining] = targets;
    if (!first) throw new Error("Expected paste targets");
    const sourceBox = {
      min: cellOf({ ...first.anchor, y: first.anchor.y + 1 }),
      max: cellOf({
        x: first.anchor.x + 1,
        y: first.anchor.y + 2,
        z: first.anchor.z + 1,
      }),
    };
    for (const target of [first, ...remaining]) {
      if (target !== first) await capturePasteSource(f, sourceBox);
      const pasted = await pasteStep(
        f,
        target.anchor.x,
        target.anchor.y,
        target.anchor.z,
        "up",
      );
      check(pasted.message === "editDoneCount", "Paste failed");
      check(
        f.count(target.cells) === target.cells.length,
        "Paste lost filled blocks",
      );
    }
    await f.tap("clear");
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
