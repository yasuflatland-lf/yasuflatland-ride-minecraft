import { ItemStack, world } from "@minecraft/server";
import {
  TEST_NAV_MAP_EVENT,
  TEST_NAV_MAP_RESULT,
} from "../../infrastructure/vehicle/testHooks/identifiers";
import { navMapReply } from "../../infrastructure/vehicle/testHooks/navMapReply";
import { requestProbe } from "../arena";
import type { Outcome } from "../outcome";

export async function navMapFullInventory(): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "A connected player is required" };
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory)
    return { pass: false, detail: "Player inventory unavailable" };

  const originalItems = Array.from({ length: inventory.size }, (_, slot) =>
    inventory.getItem(slot),
  );
  const timeoutTicks = 40;
  const stone = new ItemStack("minecraft:stone", 64);
  try {
    for (const [slot, item] of originalItems.entries()) {
      if (!item) inventory.setItem(slot, stone);
    }

    const message = await requestProbe(
      TEST_NAV_MAP_EVENT,
      TEST_NAV_MAP_RESULT,
      player.id,
      "village",
      timeoutTicks,
    );
    if (message === undefined)
      return {
        pass: false,
        detail: `Village probe did not reply within ${timeoutTicks} ticks`,
      };
    const reply = navMapReply.parse(message);
    if (!reply)
      return {
        pass: false,
        detail: `Invalid village probe reply (${message})`,
      };
    if ("error" in reply)
      return { pass: false, detail: `Village probe failed (${reply.error})` };

    const { result, path } = reply;
    return {
      pass: result === "unknown" && path === "spawn",
      detail: `Village probe returned result=${result}, path=${path}`,
    };
  } finally {
    for (const [slot, item] of originalItems.entries()) {
      inventory.setItem(slot, item);
    }
  }
}
