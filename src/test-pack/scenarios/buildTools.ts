import {
  type BlockPermutation,
  type Entity,
  ItemStack,
  type Player,
  system,
  world,
} from "@minecraft/server";
import { blockStateOf, sameBlockState } from "../../domain/build/blockState";
import { BUILD_SPEC } from "../../domain/build/spec";
import { asDimensionId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import {
  BULLDOZER_TYPE,
  SELECTION_WAND_TYPE,
  TEST_CORNER_EVENT,
  TEST_EDIT_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
} from "../../infrastructure/build/identifiers";
import { type Arena, wait, withCar } from "../arena";
import type { Outcome } from "../outcome";

function riddenEntity(player: Player): Entity | undefined {
  try {
    return player.getComponent("minecraft:riding")?.entityRidingOn;
  } catch {
    // Bedrock can throw here when the mount was removed, even for a standing player.
    return undefined;
  }
}

function ejectPlayer(player: Player, mount: Entity): void {
  try {
    if (player.isValid && mount.isValid)
      mount.getComponent("minecraft:rideable")?.ejectRider(player);
  } catch {
    // The player or mount may already be invalid during failure cleanup.
  }
}

async function boardBulldozer(player: Player, car: Entity): Promise<void> {
  const rideable = car.getComponent("minecraft:rideable");
  if (!rideable) throw new Error("bulldozer rideable component missing");
  let seatedTicks = 0;
  let added = false;
  for (let tick = 0; tick < 40; tick++) {
    const mount = riddenEntity(player);
    if (mount?.id === car.id) {
      if (++seatedTicks >= 2) return;
    } else {
      seatedTicks = 0;
      // Bedrock can refuse reboarding during dismount; addRider alone is not confirmation.
      if (!mount) added = rideable.addRider(player);
    }
    await wait(1);
  }
  const mount = riddenEntity(player);
  throw new Error(
    `player did not stay seated in bulldozer after 40 ticks: addRider=${added} mount=${mount?.typeId ?? "none"}/${mount?.id ?? "none"} expected=${car.id} riders=${rideable
      .getRiders()
      .map((rider) => rider.id)
      .join(",")}`,
  );
}

function withPlayerBulldozer(
  a: Arena,
  { player, x, z, yaw }: { player: Player; x: number; z: number; yaw: number },
  run: (car: Entity) => Promise<Outcome>,
): Promise<Outcome> {
  return withCar(
    a,
    x,
    z,
    yaw,
    async (car) => {
      try {
        return await run(car);
      } finally {
        // withCar removes the mount after this callback, so dismount on failures too.
        ejectPlayer(player, car);
        // Let Bedrock release the rider before removing the mount and starting another test.
        await wait(2);
      }
    },
    BULLDOZER_TYPE,
  );
}

/** Engine permutation round trips run without a connected player. */
export async function buildBlockStates(a: Arena): Promise<Outcome> {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const dimension = asDimensionId(a.dim.id);
  const cell = a.at(20, a.gy + 8, 20);
  const original = blocks.stateAt(dimension, cell);
  if (!original) return { pass: false, detail: "test cell unreadable" };
  try {
    const state = blockStateOf("minecraft:oak_log", { pillar_axis: "x" });
    const written = blocks.setState(dimension, cell, state);
    const actual = blocks.stateAt(dimension, cell);
    return {
      pass:
        written &&
        !!actual &&
        actual.typeId === state.typeId &&
        actual.states.pillar_axis === "x" &&
        blocks.mayEdit(dimension, cell),
      detail: `written=${written} state=${JSON.stringify(actual)}`,
    };
  } finally {
    blocks.setState(dimension, cell, original);
  }
}

interface Reply {
  player: string;
  message?: string;
  selection?: unknown;
  mode?: boolean;
  ticks?: number;
}

/** Exercises real edit handlers and tick jobs with a seated player, bypassing only the forms. */
export async function buildEdits(a: Arena): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid || riddenEntity(player))
    return { pass: false, detail: "an unseated connected player is required" };
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const saved = new Map<
    string,
    { cell: { x: number; y: number; z: number }; permutation: BlockPermutation }
  >();
  const at = (x: number, y: number, z: number) => {
    const cell = a.at(x, y, z);
    const block = a.dim.getBlock(cell);
    if (!block) throw new Error("unreadable edit test cell");
    const key = `${x},${y},${z}`;
    if (!saved.has(key))
      saved.set(key, { cell, permutation: block.permutation });
    return block;
  };
  const replies: Reply[] = [];
  const listener = (ev: { id: string; message: string }) => {
    if (ev.id !== TEST_RESULT_EVENT) return;
    const reply: Reply = JSON.parse(ev.message);
    if (reply.player === player.name) replies.push(reply);
  };
  const query = async (event: string, message: string): Promise<Reply> => {
    replies.length = 0;
    system.sendScriptEvent(event, message);
    for (let tick = 0; tick < 100; tick++) {
      await wait(1);
      const reply = replies.at(-1);
      if (reply) return reply;
    }
    throw new Error(`no response to ${event}: ${message}`);
  };
  const corner = (name: string, x: number, y: number, z: number) =>
    query(
      TEST_CORNER_EVENT,
      JSON.stringify({ player: player.name, corner: name, ...a.at(x, y, z) }),
    );
  const select = async (x: number, y: number, z: number, size: number) => {
    await corner("pos1", x, y, z);
    await corner("pos2", x + size - 1, y + size - 1, z + size - 1);
  };
  const edit = (command: string) =>
    query(TEST_EDIT_EVENT, `${player.id} ${command}`);
  const check = (ok: boolean, detail: string) => {
    if (!ok) throw new Error(detail);
  };
  const cube = (x: number, y: number, z: number, size: number) => {
    const cells = [];
    for (let dx = 0; dx < size; dx++)
      for (let dy = 0; dy < size; dy++)
        for (let dz = 0; dz < size; dz++)
          cells.push(at(x + dx, y + dy, z + dz));
    return cells;
  };
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    return await withPlayerBulldozer(
      a,
      { player, x: 20.5, z: 20.5, yaw: -90 },
      async (car) => {
        player.teleport(a.at(20.5, a.gy, 20.5), { dimension: a.dim });
        await boardBulldozer(player, car);
        const y = a.gy + 1;
        const cells = cube(50, y, 50, 3);
        for (const [i, block] of cells.entries()) {
          block.setType(i % 2 === 0 ? "minecraft:oak_log" : "minecraft:air");
          if (i % 2 === 0)
            block.setPermutation(
              block.permutation.withState("pillar_axis", "x"),
            );
        }
        const original = cells.map((b) => b.permutation);
        await select(50, y, 50, 3);
        await edit("fill minecraft:stone");
        check(
          cells.every((b) => b.typeId === "minecraft:stone"),
          "fill did not fill all 27 cells",
        );
        await edit("undo");
        check(
          cells.every((b, i) => {
            const before = original[i];
            return (
              !!before &&
              sameBlockState(
                blockStateOf(b.typeId, b.permutation.getAllStates()),
                blockStateOf(before.type.id, before.getAllStates()),
              )
            );
          }),
          "undo did not restore exact permutations",
        );

        const chest = cells[0];
        if (!chest) throw new Error("missing chest test cell");
        chest.setType("minecraft:chest");
        const contents = chest.getComponent("minecraft:inventory")?.container;
        if (!contents) throw new Error("chest inventory missing");
        contents.setItem(0, new ItemStack("minecraft:diamond", 7));
        await edit("fill minecraft:stone");
        check(
          chest.typeId === "minecraft:chest" &&
            contents.getItem(0)?.typeId === "minecraft:diamond" &&
            contents.getItem(0)?.amount === 7,
          "fill changed a chest or its contents",
        );
        const nonmatching = cells[1];
        if (!nonmatching) throw new Error("missing nonmatching test cell");
        nonmatching.setType("minecraft:oak_log");
        nonmatching.setPermutation(
          nonmatching.permutation.withState("pillar_axis", "x"),
        );
        await edit("replace minecraft:stone minecraft:dirt");
        check(
          cells.slice(2).every((b) => b.typeId === "minecraft:dirt") &&
            nonmatching.typeId === "minecraft:oak_log" &&
            nonmatching.permutation.getState("pillar_axis") === "x" &&
            chest.typeId === "minecraft:chest" &&
            contents.getItem(0)?.amount === 7,
          "replace touched a nonmatching block or missed stone",
        );
        contents.clearAll();
        chest.setType("minecraft:air");
        await edit("copy");
        const copied = cells.map((b) => b.typeId);
        const target = cube(55, y, 50, 3);
        for (const block of target) block.setType("minecraft:gold_block");
        const start = car.location;
        // Real driver input takes precedence over drive()'s injected test input.
        car.teleport({ x: start.x + 5, y: start.y, z: start.z });
        await wait(2);
        check(
          riddenEntity(player)?.id === car.id &&
            Math.floor(car.location.x) === Math.floor(start.x) + 5 &&
            Math.floor(car.location.y) === Math.floor(start.y) &&
            Math.floor(car.location.z) === Math.floor(start.z),
          "teleport did not preserve the rider and shift bulldozer feet by five x cells",
        );
        await edit("paste 0");
        check(
          target.every((b, i) => b.typeId === copied[i]),
          "paste did not preserve the five-cell offset or overwrite air",
        );
        // Copy again at the new feet so the second paste targets the original selection.
        await edit("copy");
        for (const block of cells) block.setType("minecraft:gold_block");
        await edit("paste 1");
        check(
          cells.every(
            (b, i) =>
              b.typeId ===
              (copied[i] === "minecraft:air"
                ? "minecraft:gold_block"
                : copied[i]),
          ),
          "skip-air paste overwrote an air destination or missed a solid cell",
        );

        const feet = a.local(car.location);
        await select(
          Math.floor(feet.x),
          Math.floor(feet.y),
          Math.floor(feet.z),
          1,
        );
        await edit("copy");
        const blocked = await edit("paste 0");
        check(
          blocked.message === "pasteBlocked",
          "paste over the bulldozer was not refused",
        );

        const size = Math.ceil(Math.cbrt(BUILD_SPEC.blocksPerTick + 1));
        const large = cube(65, a.gy + 8, 55, size);
        for (const block of large) block.setType("minecraft:air");
        await select(65, a.gy + 8, 55, size);
        let heartbeat = 0;
        let sawPartial = false;
        const timer = system.runInterval(() => {
          heartbeat++;
          if (
            large[0]?.typeId === "minecraft:stone" &&
            large.at(-1)?.typeId === "minecraft:air"
          )
            sawPartial = true;
        }, 1);
        try {
          const filled = await edit("fill minecraft:stone");
          check(
            (filled.ticks ?? 0) >= 1 &&
              heartbeat >= 1 &&
              sawPartial &&
              large.every((b) => b.typeId === "minecraft:stone"),
            "large fill did not finish over multiple live server ticks",
          );
        } finally {
          system.clearRun(timer);
        }
        await corner("clear", 0, a.gy, 0);
        return {
          pass: true,
          detail:
            "fill/undo permutations, chest contents, replace mask, moved paste offset, skip air, protected paste, and tick budget verified",
        };
      },
    );
  } finally {
    system.afterEvents.scriptEventReceive.unsubscribe(listener);
    for (const { cell, permutation } of saved.values())
      a.dim.getBlock(cell)?.setPermutation(permutation);
    if (player.isValid) {
      player.teleport(location, { dimension, rotation });
    }
  }
}

/** Requires a connected player; stable APIs cannot create one or read back a camera preset (ADR 0001, 0010). */
export async function buildSelectionAndMode(a: Arena): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "a connected player is required" };
  if (riddenEntity(player))
    return { pass: false, detail: "the test player must start unseated" };
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return { pass: false, detail: "player inventory missing" };
  const slot = player.selectedSlotIndex;
  const item = inventory.getItem(slot);
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const replies: Reply[] = [];
  const listener = (ev: { id: string; message: string }) => {
    if (ev.id !== TEST_RESULT_EVENT) return;
    const reply: Reply = JSON.parse(ev.message);
    if (reply.player === player.name) replies.push(reply);
  };
  const query = async (event: string, message: string): Promise<Reply> => {
    replies.length = 0;
    system.sendScriptEvent(event, message);
    await wait(2);
    const reply = replies.at(-1);
    if (!reply) throw new Error(`no response to ${event}`);
    return reply;
  };
  const corner = (name: string, x: number) =>
    query(
      TEST_CORNER_EVENT,
      JSON.stringify({
        player: player.name,
        corner: name,
        ...a.at(x, a.gy, 20),
      }),
    );
  const mode = () => query(TEST_MODE_EVENT, player.name);
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    return await withPlayerBulldozer(
      a,
      { player, x: 20.5, z: 20.5, yaw: 0 },
      async (car) => {
        player.teleport(a.at(20.5, a.gy, 20.5), { dimension: a.dim });
        inventory.setItem(slot, new ItemStack(SELECTION_WAND_TYPE));
        await boardBulldozer(player, car);
        await corner("clear", 20);
        await wait(BUILD_SPEC.modeEnterTicks);
        const active = await mode();
        // A short hotbar scroll must not flick build mode or the vehicle's camera wish.
        inventory.setItem(slot, undefined);
        await wait(1);
        inventory.setItem(slot, new ItemStack(SELECTION_WAND_TYPE));
        const scroll = await mode();
        await corner("clear", 20);
        ejectPlayer(player, car);
        await wait(2);
        const inactive = await mode();
        const refused = await corner("pos1", 25);
        return {
          pass:
            active.mode === true &&
            scroll.mode === true &&
            inactive.mode === false &&
            refused.message === "notInBulldozer" &&
            refused.selection === null,
          detail: `mode=${active.mode} scroll=${scroll.mode} off=${inactive.mode} refusal=${refused.message}; visually verify third person while active and restored view after dismount`,
        };
      },
    );
  } finally {
    system.afterEvents.scriptEventReceive.unsubscribe(listener);
    if (player.isValid) {
      inventory.setItem(slot, item);
      player.teleport(location, { dimension, rotation });
    }
  }
}
