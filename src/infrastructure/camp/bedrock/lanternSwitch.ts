// The tent lantern's place in the headlight switch router (ADR 0024, 0115, 0134).
import { type Player, system } from "@minecraft/server";
import type { SwitchLantern } from "../../../application/camp/switchLantern";
import type { TentId } from "../../../domain/camp/tent";
import { asDimensionId, type DimensionId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { SwitchTarget } from "../../shared/switchRouter";
import { LOW_CHAIR_TYPE } from "../identifiers";

export function lanternSwitchTarget(
  lantern: SwitchLantern,
  tentContaining: (dimensionId: DimensionId, feet: Vec3) => TentId | undefined,
): SwitchTarget {
  const tentOf = (player: Player): TentId | undefined =>
    tentContaining(asDimensionId(player.dimension.id), player.location);
  // A player seated on a Low Chair in the front room may switch; a rider of
  // anything else is the vehicle target's, or no one's.
  const claims = (player: Player): boolean => {
    if (!player.isValid) return false;
    const mount = player.getComponent("minecraft:riding")?.entityRidingOn;
    if (mount !== undefined && mount.typeId !== LOW_CHAIR_TYPE) return false;
    return tentOf(player) !== undefined;
  };
  return {
    claimsItemUse: claims,
    // Any block press in the tent is taken over, so the switch never also
    // opens a flap or starts a sleep, as in the camper room (ADR 0115, 0134).
    claimsBlockPress: claims,
    /** Entity presses inside a tent, such as on a Low Chair, keep their default. */
    claimsEntityPress: () => false,
    switchFor: (player) => {
      if (!player.isValid) return;
      const tentId = tentOf(player);
      if (tentId === undefined) return;
      lantern.execute({ tentId, tick: system.currentTick });
    },
  };
}
