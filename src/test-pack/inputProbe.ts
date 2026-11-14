import {
  type BlockRaycastHit,
  type Player,
  system,
  world,
} from "@minecraft/server";

const PROBE_EVENT = "yasu_ride_test:probe";
// Literal id: importing the build identifiers would make every build change run all scenarios (impact.ts).
const WAND = "yasu_build:selection_wand";
const REACH = 64;
const LOOK_REACH = 6;
const LOOK_INTERVAL_TICKS = 2;
const PIXELS_PER_BLOCK = 16;

const watching = new Set<string>();
const drawerWatching = new Set<string>();
const lookWatching = new Set<string>();
const lastLookKeys = new Map<string, string>();
let lookInterval: number | undefined;

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

function blockIdentity(hit: BlockRaycastHit | undefined): string {
  return hit
    ? `${hit.block.typeId} location=${point(hit.block.location)} face=${hit.face}`
    : "none";
}

function stopLooking(id: string): void {
  lookWatching.delete(id);
  lastLookKeys.delete(id);
  if (lookWatching.size === 0 && lookInterval !== undefined) {
    system.clearRun(lookInterval);
    lookInterval = undefined;
  }
}

function startLooking(id: string): void {
  lookWatching.add(id);
  if (lookInterval !== undefined) return;
  lookInterval = system.runInterval(() => {
    const players = new Map(
      world.getAllPlayers().map((player) => [player.id, player]),
    );
    for (const playerId of lookWatching) {
      const player = players.get(playerId);
      try {
        if (!player?.isValid) {
          stopLooking(playerId);
          drawerWatching.delete(playerId);
          continue;
        }
        const hit = player.getBlockFromViewDirection({
          maxDistance: LOOK_REACH,
        });
        const passable = player.getBlockFromViewDirection({
          maxDistance: LOOK_REACH,
          includePassableBlocks: true,
        });
        const entities = player.getEntitiesFromViewDirection({
          maxDistance: LOOK_REACH,
        });
        const block = blockIdentity(hit);
        const yPx = hit ? hit.faceLocation.y * PIXELS_PER_BLOCK : undefined;
        const key = `${block} yPx=${yPx?.toFixed(1) ?? "none"} entity=${entities[0]?.entity.typeId ?? "none"}`;
        if (lastLookKeys.get(playerId) === key) continue;
        const hitDetail = hit
          ? ` location=${point(hit.block.location)} face=${hit.face} faceLocation=${point(hit.faceLocation)} faceLocation.yPx=${yPx?.toFixed(3)}`
          : "";
        const passableDetail =
          passable && blockIdentity(passable) !== block
            ? ` passable=${blockIdentity(passable)}`
            : "";
        const entityDetail =
          entities
            .map(
              ({ entity, distance }) =>
                `${entity.typeId}@${distance.toFixed(3)}`,
            )
            .join(",") || "none";
        const held =
          player
            .getComponent("minecraft:inventory")
            ?.container?.getItem(player.selectedSlotIndex)?.typeId ?? "empty";
        const riding = player.getComponent("minecraft:riding") !== undefined;
        console.warn(
          `[look probe] tick=${system.currentTick} block=${hit?.block.typeId ?? "none"}${hitDetail}${passableDetail} entities=${entityDetail} head=${point(player.getHeadLocation())} view=${point(player.getViewDirection())} riding=${riding} held=${held}`,
        );
        lastLookKeys.set(playerId, key);
      } catch {
        if (!player?.isValid) {
          stopLooking(playerId);
          drawerWatching.delete(playerId);
        }
      }
    }
  }, LOOK_INTERVAL_TICKS);
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  const detail = `isFirstEvent=${ev.isFirstEvent} block=${ev.block.typeId} location=${point(ev.block.location)} face=${ev.blockFace} faceLocation=${point(ev.faceLocation)} faceLocation.yPx=${(ev.faceLocation.y * PIXELS_PER_BLOCK).toFixed(3)} held=${ev.itemStack?.typeId ?? "empty"}`;
  drawerReport(ev.player, "before.playerInteractWithBlock", detail, true);
});
world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  if (!drawerWatching.has(ev.player.id)) return;
  const detail = `isFirstEvent=${ev.isFirstEvent} block=${ev.block.typeId} location=${point(ev.block.location)} face=${ev.blockFace} faceLocation=${point(ev.faceLocation)} faceLocation.yPx=${(ev.faceLocation.y * PIXELS_PER_BLOCK).toFixed(3)} held=${ev.beforeItemStack?.typeId ?? "empty"}`;
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
  if (mode === "drawer" || mode === "look") {
    watching.delete(player.id);
    drawerWatching.add(player.id);
    if (mode === "look") startLooking(player.id);
    else stopLooking(player.id);
    (player as Player).sendMessage(`[probe] ${mode}`);
    return;
  }
  stopLooking(player.id);
  drawerWatching.delete(player.id);
  const on = mode === "on";
  if (on) watching.add(player.id);
  else watching.delete(player.id);
  (player as Player).sendMessage(`[probe] ${on ? "on" : "off"}`);
});
