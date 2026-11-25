import {
  type Player,
  ScriptEventSource,
  system,
  world,
} from "@minecraft/server";
import { NAV_DESTINATIONS } from "../../../domain/vehicle/navigation/destinations";
import { NAMESPACE } from "../../shared/identifiers";
import { giveExplorerMap } from "../bedrock/navMapDelivery";
import { TEST_NAV_MAP_EVENT, TEST_NAV_MAP_RESULT } from "./identifiers";
import { navMapReply } from "./navMapReply";

// The probe must still detect a counting error in the delivery adapter.
function observeFilledMaps(player: Player): number | undefined {
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return undefined;
  let total = 0;
  for (let slot = 0; slot < inventory.size; slot++) {
    const stack = inventory.getItem(slot);
    if (stack?.typeId === "minecraft:filled_map") total += stack.amount;
  }
  return total;
}

export function registerTestNavMap(): void {
  system.afterEvents.scriptEventReceive.subscribe(
    (event) => {
      if (
        event.id !== TEST_NAV_MAP_EVENT ||
        event.sourceType !== ScriptEventSource.Server
      )
        return;
      const [playerId, name, extra] = event.message.split(",");
      if (!playerId) return;
      let reply: string;
      try {
        const destination = NAV_DESTINATIONS.find(
          (candidate) => candidate === name,
        );
        if (!destination || extra !== undefined)
          throw new Error(
            `Invalid destination: ${event.message.slice(playerId.length + 1)}`,
          );
        const player = world
          .getAllPlayers()
          .find((candidate) => candidate.id === playerId);
        if (!player) throw new Error("Player not found");
        const observedBefore = observeFilledMaps(player);
        const delivery = giveExplorerMap(player, destination);
        const observedAfter = observeFilledMaps(player);
        reply = navMapReply.format({
          playerId,
          ...delivery,
          observedBefore,
          observedAfter,
        });
      } catch (error) {
        reply = navMapReply.format({ playerId, error: String(error) });
      }
      system.sendScriptEvent(TEST_NAV_MAP_RESULT, reply);
    },
    { namespaces: [NAMESPACE] },
  );
}
