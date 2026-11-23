import {
  type Entity,
  type Player,
  type PlayerInteractWithEntityBeforeEvent,
  system,
} from "@minecraft/server";
import type {
  TopOutcome,
  TopRequest,
} from "../../../application/shared/placeOnTop";
import { asPlayerId, type PlayerId } from "../../../domain/shared/ids";
import type { TopSurface } from "../../../domain/shared/tableTop";
import type { TickScopedSet } from "../../../domain/shared/tickScoped";
import { heldTypeId } from "../heldItem";
import { showTopRefusal, topAim } from "./aim";
import type { TopHostRegistry } from "./registry";

/** Returns true when the held item's placement handler takes the interaction. */
export type PlaceHostedOnTop = (player: Player, host: Entity) => boolean;

export function registerHostedOnTop({
  itemId,
  placeOnTop,
  registry,
  placements,
}: {
  itemId: string;
  placeOnTop(surface: TopSurface, cmd: TopRequest): TopOutcome;
  registry: TopHostRegistry;
  placements: TickScopedSet<PlayerId>;
}) {
  return (
    placer: Player,
    host: Entity,
    interaction?: Pick<PlayerInteractWithEntityBeforeEvent, "itemStack">,
  ): boolean => {
    const held = interaction
      ? interaction.itemStack?.typeId
      : heldTypeId(placer);
    if (held !== itemId) return false;
    const type = registry.hostTypeOf(host);
    if (!type) return false;
    const player = asPlayerId(placer.id);
    if (!placements.add(system.currentTick, player)) return true;
    const slot = placer.selectedSlotIndex;
    const aim = topAim(placer, host, type.surface);
    const id = host.id;
    system.run(() =>
      showTopRefusal(
        placer,
        type,
        placeOnTop(type.surface, {
          player,
          hostType: type.hostType,
          host: id,
          slot,
          aim,
        }),
      ),
    );
    return true;
  };
}
