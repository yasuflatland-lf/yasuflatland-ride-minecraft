import { type Entity, type Player, system, world } from "@minecraft/server";
import type { EnterRoofTent } from "../../../../application/camp/enterRoofTent";
import type { RoofTentOccupantWorld } from "../../../../application/camp/ports/roofTentOccupant";
import { ROOF_TENT_SPEC } from "../../../../domain/camp/spec";
import { asPlayerId, type PlayerId } from "../../../../domain/shared/ids";
import { TickScopedSet } from "../../../../domain/shared/tickScoped";
import { heldDye } from "../../../shared/dyes";
import { ROOF_TENT_SNEAK_HINT, ROOF_TENT_TYPE } from "../../identifiers";

export interface RoofTentFootAccess {
  hostOf(tent: Entity): string | undefined;
  tentOfHost(hostId: string): Entity | undefined;
  loadedTents(): Entity[];
  canSeeEntryHint(tent: Entity, player: Player): boolean;
  atFoot(tent: Entity, player: Player): boolean;
}

export function registerRoofTentEnter(
  enter: EnterRoofTent,
  occupants: RoofTentOccupantWorld,
  showMenu: (player: Player, tentId: string) => Promise<void>,
  track: (playerId: PlayerId, tentId: string) => void,
  entranceReach: (tent: Entity, player: Player) => boolean,
  foot: RoofTentFootAccess,
): void {
  const pressed = new TickScopedSet<PlayerId>();
  const disarmed = new Set<PlayerId>();
  const hintedAt = new Map<PlayerId, number>();
  const enterAndTrack = (playerId: PlayerId, tentId: string): void => {
    if (enter.execute({ playerId, tentId })) {
      disarmed.add(playerId);
      track(playerId, tentId);
    }
  };
  const deferEntry = (
    player: Player,
    target: Entity,
    fromFoot: boolean,
  ): void => {
    const playerId = asPlayerId(player.id);
    if (!pressed.add(system.currentTick, playerId)) return;
    system.run(() => {
      if (!player.isValid || !target.isValid || heldDye(player)) return;
      const tentId = target.id;
      if (fromFoot) {
        if (player.isSneaking && foot.atFoot(target, player))
          enterAndTrack(playerId, tentId);
        return;
      }
      if (occupants.occupantOf(tentId) === playerId) {
        track(playerId, tentId);
        void showMenu(player, tentId);
        return;
      }
      if (player.dimension.id !== target.dimension.id) return;
      const a = player.location;
      const b = target.location;
      if (
        Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) >
          ROOF_TENT_SPEC.interactReach &&
        !entranceReach(target, player)
      )
        return;
      if (!player.isSneaking) {
        player.onScreenDisplay.setActionBar({
          translate: ROOF_TENT_SNEAK_HINT,
        });
        return;
      }
      enterAndTrack(playerId, tentId);
    });
  };
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const { player, target } = ev;
    if (heldDye(player)) return;
    if (target.typeId === ROOF_TENT_TYPE) {
      ev.cancel = true;
      deferEntry(player, target, false);
      return;
    }
    const tent = foot.tentOfHost(target.id);
    if (!tent || !player.isSneaking || !foot.atFoot(tent, player)) return;
    ev.cancel = true;
    deferEntry(player, tent, true);
  });
  system.runInterval(() => {
    const tents = foot.loadedTents();
    for (const player of world.getAllPlayers()) {
      const playerId = asPlayerId(player.id);
      const nearby = tents.filter((tent) => foot.atFoot(tent, player));
      if (!player.isSneaking || nearby.length === 0) disarmed.delete(playerId);
      if (player.getComponent?.("minecraft:riding") !== undefined) continue;
      if (!player.isSneaking) {
        const lastHint = hintedAt.get(playerId);
        if (
          tents.some((tent) => foot.canSeeEntryHint(tent, player)) &&
          (lastHint === undefined || system.currentTick - lastHint >= 20)
        ) {
          player.onScreenDisplay.setActionBar({
            translate: ROOF_TENT_SNEAK_HINT,
          });
          hintedAt.set(playerId, system.currentTick);
        }
        continue;
      }
      if (disarmed.has(playerId)) continue;
      const tent = nearby.find(
        (tent) => occupants.occupantOf(tent.id) === undefined,
      );
      if (tent && pressed.add(system.currentTick, playerId))
        enterAndTrack(playerId, tent.id);
    }
  }, 4);
}
