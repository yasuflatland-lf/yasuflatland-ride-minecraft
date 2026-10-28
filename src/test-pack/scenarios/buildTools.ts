import { ItemStack, system, world } from "@minecraft/server";
import { blockStateOf } from "../../domain/build/blockState";
import { BUILD_SPEC } from "../../domain/build/spec";
import { asDimensionId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import {
  BULLDOZER_TYPE,
  SELECTION_WAND_TYPE,
  TEST_CORNER_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
} from "../../infrastructure/build/identifiers";
import { type Arena, type Outcome, wait, withCar } from "../arena";

/** Engine permutation round trips run without a connected player. */
export async function buildBlockStates(a: Arena): Promise<Outcome> {
  const blocks = new BedrockBlockWorld({ isProtected: () => false });
  const dimension = asDimensionId(a.dim.id);
  const cell = { x: 20, y: a.gy + 8, z: 20 };
  const original = blocks.stateAt(dimension, cell);
  if (!original) return { pass: false, detail: "test cell unreadable" };
  try {
    const state = blockStateOf("minecraft:oak_log", { pillar_axis: "x" });
    const written = blocks.setState(dimension, cell, state);
    const actual = blocks.stateAt(dimension, cell);
    const protectedBlocks = new BedrockBlockWorld({ isProtected: () => true });
    return {
      pass:
        written &&
        !!actual &&
        actual.typeId === state.typeId &&
        actual.states.pillar_axis === "x" &&
        blocks.mayEdit(dimension, cell) &&
        !protectedBlocks.mayEdit(dimension, cell),
      detail: `written=${written} state=${JSON.stringify(actual)}`,
    };
  } finally {
    blocks.setState(dimension, cell, original);
  }
}

interface Reply {
  player: string;
  message?: string;
  count?: number;
  selection?: { pos1?: { x: number }; pos2?: { x: number } } | null;
  mode?: boolean;
}

/** Requires a connected player; stable APIs cannot create one or read back a camera preset (ADR 0001, 0010). */
export async function buildSelectionAndMode(a: Arena): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "a connected player is required" };
  if (player.getComponent("minecraft:riding")?.entityRidingOn)
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
      JSON.stringify({ player: player.name, corner: name, x, y: a.gy, z: 20 }),
    );
  const mode = () => query(TEST_MODE_EVENT, player.name);
  system.afterEvents.scriptEventReceive.subscribe(listener);
  try {
    return await withCar(
      a,
      20.5,
      20.5,
      0,
      async (car) => {
        player.teleport({ x: 20.5, y: a.gy, z: 20.5 }, { dimension: a.dim });
        inventory.setItem(slot, new ItemStack(SELECTION_WAND_TYPE));
        const rideable = car.getComponent("minecraft:rideable");
        if (!rideable?.addRider(player))
          return { pass: false, detail: "player could not board bulldozer" };
        await wait(2);
        await corner("clear", 20);
        const first = await corner("pos1", 21);
        const second = await corner("pos2", 23);
        await wait(BUILD_SPEC.modeEnterTicks);
        const active = await mode();
        // A short hotbar scroll must not flick build mode or the vehicle's camera wish.
        inventory.setItem(slot, undefined);
        await wait(1);
        inventory.setItem(slot, new ItemStack(SELECTION_WAND_TYPE));
        const scroll = await mode();
        await corner("clear", 20);
        rideable.ejectRider(player);
        await wait(2);
        const inactive = await mode();
        const refused = await corner("pos1", 25);
        return {
          pass:
            first.message === "pos1Set" &&
            first.selection?.pos1?.x === 21 &&
            second.message === "pos2Set" &&
            second.selection?.pos2?.x === 23 &&
            second.count === 3 &&
            active.mode === true &&
            scroll.mode === true &&
            inactive.mode === false &&
            refused.message === "notInBulldozer" &&
            refused.selection === null,
          detail: `pos1=${first.message} volume=${second.count} mode=${active.mode} scroll=${scroll.mode} off=${inactive.mode} refusal=${refused.message}; visually verify third person while active and restored view after dismount`,
        };
      },
      BULLDOZER_TYPE,
    );
  } finally {
    system.afterEvents.scriptEventReceive.unsubscribe(listener);
    if (player.isValid) {
      player
        .getComponent("minecraft:riding")
        ?.entityRidingOn?.getComponent("minecraft:rideable")
        ?.ejectRider(player);
      inventory.setItem(slot, item);
      player.teleport(location, { dimension, rotation });
    }
  }
}
