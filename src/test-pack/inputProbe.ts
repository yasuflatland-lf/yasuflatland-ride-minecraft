import { type Player, system, world } from "@minecraft/server";
import { buildId } from "../infrastructure/build/identifiers";

const PROBE_EVENT = "yasu_ride_test:probe";
const WAND = buildId("selection_wand");
const REACH = 64;

const watching = new Set<string>();

function holdsWand(player: Player): boolean {
  const slot = player
    .getComponent("minecraft:inventory")
    ?.container?.getItem(player.selectedSlotIndex);
  return slot?.typeId === WAND;
}

function report(player: Player, name: string, detail = ""): void {
  if (!watching.has(player.id) || !holdsWand(player)) return;
  const block = player.getBlockFromViewDirection({ maxDistance: REACH });
  player.sendMessage(
    `[probe] ${name} tick=${system.currentTick}${detail} block=${block ? "yes" : "no"} sneak=${player.isSneaking}`,
  );
}

// Output feeds the event table of the paste input spike (issue 1131).
world.afterEvents.itemUse.subscribe(({ source }) => report(source, "itemUse"));
world.afterEvents.itemStartUse.subscribe(({ source }) =>
  report(source, "startItemUse"),
);
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { player, isFirstEvent } = ev;
  system.run(() =>
    report(player, "playerInteractWithBlock", ` isFirstEvent=${isFirstEvent}`),
  );
});
world.beforeEvents.playerBreakBlock.subscribe((ev) => {
  const { player } = ev;
  system.run(() => report(player, "playerBreakBlock"));
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== PROBE_EVENT) return;
  const player = ev.sourceEntity;
  if (player?.typeId !== "minecraft:player") return;
  const on = ev.message.trim() === "on";
  if (on) watching.add(player.id);
  else watching.delete(player.id);
  (player as Player).sendMessage(`[probe] ${on ? "on" : "off"}`);
});
