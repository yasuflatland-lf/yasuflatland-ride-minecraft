// Particles cannot be read back, so these scenarios check what the outline use
// case asks the feedback adapter to draw for a seated player in build mode (ADR 0183).
import { ItemStack, system, world } from "@minecraft/server";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { Cell } from "../../domain/shared/cells";
import {
  SELECTION_WAND_TYPE,
  TEST_CORNER_EVENT,
  TEST_CORNER_MARKER_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
} from "../../infrastructure/build/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";
import {
  boardBulldozer,
  riddenEntity,
  withPlayerBulldozer,
} from "./buildTools";

interface Reply {
  player: string;
  mode?: boolean;
  corner?: Cell | null;
  outline?: boolean;
  cornerCount?: number;
}

interface Marker {
  corner: Cell | null;
  outline: boolean;
  cornerCount: number;
}

interface Steps {
  corner(name: "pos1" | "pos2" | "clear", cell: Cell): Promise<void>;
  marker(): Promise<Marker>;
  pos1: Cell;
  pos2: Cell;
}

const sameCell = (a: Cell | null, b: Cell): boolean =>
  !!a && a.x === b.x && a.y === b.y && a.z === b.z;

const describe = (m: Marker): string =>
  `corner=${JSON.stringify(m.corner)} outline=${m.outline} count=${m.cornerCount}`;

/** Seats the first connected player in a bulldozer with the wand held until build mode is on. */
async function withBuildMode(
  a: Arena,
  run: (steps: Steps) => Promise<Outcome>,
): Promise<Outcome> {
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
  const steps: Steps = {
    corner: async (name, cell) => {
      await query(
        TEST_CORNER_EVENT,
        JSON.stringify({ player: player.name, corner: name, ...cell }),
      );
    },
    marker: async () => {
      const reply = await query(
        TEST_CORNER_MARKER_EVENT,
        JSON.stringify({ player: player.name }),
      );
      return {
        corner: reply.corner ?? null,
        outline: reply.outline === true,
        cornerCount: reply.cornerCount ?? 0,
      };
    },
    pos1: { x: 22, y: a.gy, z: 24 },
    pos2: { x: 25, y: a.gy + 2, z: 27 },
  };
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    return await withPlayerBulldozer(
      a,
      { player, x: 20.5, z: 20.5, yaw: 0 },
      async (car) => {
        player.teleport({ x: 20.5, y: a.gy, z: 20.5 }, { dimension: a.dim });
        inventory.setItem(slot, new ItemStack(SELECTION_WAND_TYPE));
        await boardBulldozer(player, car);
        await steps.corner("clear", steps.pos1);
        await wait(BUILD_SPEC.modeEnterTicks);
        const mode = await query(TEST_MODE_EVENT, player.name);
        if (mode.mode !== true)
          return { pass: false, detail: "build mode did not turn on" };
        try {
          return await run(steps);
        } finally {
          await steps.corner("clear", steps.pos1);
        }
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

function loneCorner(a: Arena, name: "pos1" | "pos2"): Promise<Outcome> {
  return withBuildMode(a, async (steps) => {
    const cell = steps[name];
    await steps.corner(name, cell);
    const m = await steps.marker();
    return {
      pass: sameCell(m.corner, cell) && m.cornerCount === 1 && !m.outline,
      detail: `${name} only: ${describe(m)}`,
    };
  });
}

export function buildCornerMarkerPos1(a: Arena): Promise<Outcome> {
  return loneCorner(a, "pos1");
}

export function buildCornerMarkerPos2(a: Arena): Promise<Outcome> {
  return loneCorner(a, "pos2");
}

export function buildCornerMarkerNone(a: Arena): Promise<Outcome> {
  return withBuildMode(a, async (steps) => {
    const empty = await steps.marker();
    await steps.corner("pos1", steps.pos1);
    const set = await steps.marker();
    await steps.corner("clear", steps.pos1);
    const cleared = await steps.marker();
    const nothing = (m: Marker) =>
      m.corner === null && m.cornerCount === 0 && !m.outline;
    return {
      pass:
        nothing(empty) && sameCell(set.corner, steps.pos1) && nothing(cleared),
      detail: `none: ${describe(empty)}; pos1: ${describe(set)}; cleared: ${describe(cleared)}`,
    };
  });
}

export function buildCornerMarkerPair(a: Arena): Promise<Outcome> {
  return withBuildMode(a, async (steps) => {
    await steps.corner("pos1", steps.pos1);
    await steps.corner("pos2", steps.pos2);
    const m = await steps.marker();
    return {
      pass: m.outline && m.corner === null && m.cornerCount === 0,
      detail: `pair: ${describe(m)}`,
    };
  });
}
