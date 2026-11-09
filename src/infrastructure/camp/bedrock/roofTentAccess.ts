import { type Entity, type Player, world } from "@minecraft/server";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import {
  canReachEntrance,
  canSeeEntryHint,
  canStandAtFoot,
} from "../../../domain/camp/roofTent/access";
import { decodeHost } from "../../../domain/shared/hosted";
import { ROOF_TENT_HOST_PROPERTY, ROOF_TENT_TYPE } from "../identifiers";
import type { RoofTentFootAccess } from "./handlers/roofTentEnter";
import { loadedEntityIds } from "./hostedEntities";

export function createEntranceReach(
  lookup: VehicleHostLookup,
): (tent: Entity, player: Player) => boolean {
  return (tent, player) => {
    const marker = tent.getDynamicProperty(ROOF_TENT_HOST_PROPERTY);
    if (typeof marker !== "string") return false;
    const host = decodeHost(marker);
    if (host.kind !== "vehicle") return false;
    const state = lookup(host.id);
    return (
      state.status === "present" &&
      state.mount !== undefined &&
      canReachEntrance(state.mount, state, player.location)
    );
  };
}

export function createHostedTents(
  lookup: VehicleHostLookup,
): RoofTentFootAccess {
  const hostOf = (tent: Entity): string | undefined => {
    const marker = tent.getDynamicProperty(ROOF_TENT_HOST_PROPERTY);
    if (typeof marker !== "string") return undefined;
    const host = decodeHost(marker);
    return host.kind === "vehicle" ? host.id : undefined;
  };
  const loadedTents = (): Entity[] =>
    loadedEntityIds(ROOF_TENT_TYPE)
      .map((id) => world.getEntity(id))
      .filter((tent): tent is Entity => tent?.isValid === true);
  const atGroundEntrance = (
    tent: Entity,
    player: Player,
    predicate: typeof canStandAtFoot,
  ): boolean => {
    if (!tent.isValid || player.dimension.id !== tent.dimension.id)
      return false;
    const hostId = hostOf(tent);
    if (hostId === undefined) return false;
    const state = lookup(hostId);
    return (
      state.status === "present" &&
      state.mount !== undefined &&
      state.dimensionId === player.dimension.id &&
      predicate(state.mount, state, player.location)
    );
  };
  return {
    hostOf,
    loadedTents,
    tentOfHost: (hostId) =>
      loadedTents().find((tent) => hostOf(tent) === hostId),
    atFoot: (tent, player) => atGroundEntrance(tent, player, canStandAtFoot),
    canSeeEntryHint: (tent, player) =>
      atGroundEntrance(tent, player, canSeeEntryHint),
  };
}
