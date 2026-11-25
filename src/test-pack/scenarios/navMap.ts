import { ItemStack, world } from "@minecraft/server";
import {
  TEST_NAV_MAP_EVENT,
  TEST_NAV_MAP_RESULT,
} from "../../infrastructure/vehicle/testHooks/identifiers";
import { navMapReply } from "../../infrastructure/vehicle/testHooks/navMapReply";
import { requestProbe } from "../arena";
import type { Outcome } from "../outcome";

const NAV_MAP_SAMPLE = ["village", "monument", "buriedtreasure"] as const;
const DELIVERY_TIMEOUT_TICKS = 40;

export async function navMapDelivery(): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "A connected player is required" };
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory)
    return { pass: false, detail: "Player inventory unavailable" };

  const deliveries: string[] = [];
  for (const destination of NAV_MAP_SAMPLE) {
    for (let slot = 0; slot < inventory.size; slot++) {
      if (inventory.getItem(slot)?.typeId === "minecraft:filled_map")
        inventory.setItem(slot, undefined);
    }
    if (inventory.emptySlotsCount === 0)
      return {
        pass: false,
        detail: `${destination} requires a free inventory slot`,
      };

    const message = await requestProbe(
      TEST_NAV_MAP_EVENT,
      TEST_NAV_MAP_RESULT,
      player.id,
      destination,
      DELIVERY_TIMEOUT_TICKS,
    );
    if (message === undefined)
      return {
        pass: false,
        detail: `${destination} did not reply within ${DELIVERY_TIMEOUT_TICKS} ticks`,
      };
    const reply = navMapReply.parse(message);
    if (!reply)
      return {
        pass: false,
        detail: `${destination} returned an invalid reply (${message})`,
      };
    if ("error" in reply)
      return { pass: false, detail: `${destination} failed (${reply.error})` };

    const { result, path, before, after, observedBefore, observedAfter } =
      reply;
    if (
      path !== "give" ||
      result === "unknown" ||
      observedBefore === undefined ||
      observedAfter === undefined ||
      before !== observedBefore ||
      after !== observedAfter
    )
      return {
        pass: false,
        detail: `${destination} returned an inconsistent delivery (${message})`,
      };

    const increase = observedAfter - observedBefore;
    const countRose = increase > 0;
    const given = result === "given";
    if (given !== countRose || (given && increase !== 1))
      return {
        pass: false,
        detail: `${destination} returned an inconsistent map count (${message})`,
      };

    deliveries.push(`${destination}=${result}`);
  }
  return { pass: true, detail: deliveries.join(", ") };
}

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
      DELIVERY_TIMEOUT_TICKS,
    );
    if (message === undefined)
      return {
        pass: false,
        detail: `Village probe did not reply within ${DELIVERY_TIMEOUT_TICKS} ticks`,
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
