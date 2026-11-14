import { type Player, system, world } from "@minecraft/server";

const PROBE_EVENT = "yasu_ride_test:probe";
// Literal id: importing the build identifiers would make every build change run all scenarios (impact.ts).
const WAND = "yasu_build:selection_wand";
const REACH = 64;

const watching = new Set<string>();
const drawerWatching = new Set<string>();

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

function drawerReport(
  player: Player,
  name: string,
  detail: string,
  deferred = false,
): void {
  if (!drawerWatching.has(player.id)) return;
  const riding = player.getComponent("minecraft:riding") !== undefined;
  const message = `[drawer probe] tick=${system.currentTick} ${name} ${detail} riding=${riding}`;
  if (deferred) system.run(() => player.sendMessage(message));
  else player.sendMessage(message);
  console.warn(message);
}

function point(v: { x: number; y: number; z: number }): string {
  return `(${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)})`;
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  const detail = `isFirstEvent=${ev.isFirstEvent} block=${ev.block.typeId} location=${point(ev.block.location)} face=${ev.blockFace} faceLocation=${point(ev.faceLocation)} faceLocation.yPx=${(ev.faceLocation.y * 16).toFixed(3)} held=${ev.itemStack?.typeId ?? "empty"}`;
  drawerReport(ev.player, "before.playerInteractWithBlock", detail, true);
});
world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  const detail = `isFirstEvent=${ev.isFirstEvent} block=${ev.block.typeId} location=${point(ev.block.location)} face=${ev.blockFace} faceLocation=${point(ev.faceLocation)} faceLocation.yPx=${(ev.faceLocation.y * 16).toFixed(3)} held=${ev.beforeItemStack?.typeId ?? "empty"}`;
  drawerReport(ev.player, "after.playerInteractWithBlock", detail);
});
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  drawerReport(
    ev.player,
    "before.playerInteractWithEntity",
    `entity=${ev.target.typeId} held=${ev.itemStack?.typeId ?? "empty"}`,
    true,
  );
});
world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  drawerReport(
    ev.player,
    "after.playerInteractWithEntity",
    `entity=${ev.target.typeId} held=${ev.beforeItemStack?.typeId ?? "empty"}`,
  );
});
world.afterEvents.itemUse.subscribe((ev) => {
  drawerReport(ev.source, "after.itemUse", `held=${ev.itemStack.typeId}`);
});

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
  const mode = ev.message.trim();
  if (mode === "drawer") {
    watching.delete(player.id);
    drawerWatching.add(player.id);
    (player as Player).sendMessage("[probe] drawer");
    return;
  }
  drawerWatching.delete(player.id);
  const on = mode === "on";
  if (on) watching.add(player.id);
  else watching.delete(player.id);
  (player as Player).sendMessage(`[probe] ${on ? "on" : "off"}`);
});
