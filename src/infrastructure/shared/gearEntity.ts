import { type Entity, ItemStack, type Player, world } from "@minecraft/server";
import type { HitsLeftFeedback } from "../../application/shared/ports/hitsLeft";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { GiveBackPolicy } from "../../domain/shared/giveBack";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { isSolidTop } from "./blocks";
import { entityOfType, spawnWithRollback } from "./entities";
import { NAMESPACE } from "./identifiers";
import {
  giveOrDrop,
  playerById,
  showActionBar,
  showHitsLeftHint,
} from "./players";

export function gearEntities<Id extends string>(
  typeIds: Parameters<typeof entityOfType>[2],
) {
  function entity(id: Id): Entity | undefined {
    try {
      return entityOfType(world, id, typeIds);
    } catch {
      return undefined;
    }
  }

  return {
    entity,
    remove(id: Id): void {
      entity(id)?.remove();
    },
  };
}

export function spawnIn(
  dimensionId: DimensionId,
  typeId: string,
  at: Vec3,
  yaw: number,
  setup?: (entity: Entity) => void,
): Entity | undefined {
  let dimension: ReturnType<typeof world.getDimension>;
  try {
    dimension = world.getDimension(dimensionId);
  } catch {
    return undefined;
  }
  return spawnWithRollback(dimension, typeId, at, yaw, setup);
}

export function giveBackReceiver(
  policy: GiveBackPolicy,
  hitter: PlayerId | undefined,
): Player | undefined {
  return policy === "hitter" && hitter !== undefined
    ? playerById(hitter)
    : undefined;
}

export function giveBack(
  entity: Pick<Entity, "dimension" | "location">,
  itemId: string,
  receiver?: Player,
): void {
  const item = new ItemStack(itemId, 1);
  if (receiver) giveOrDrop(receiver, [item]);
  else entity.dimension.spawnItem(item, entity.location);
}

interface GearFeedback extends HitsLeftFeedback {
  showBlocked(player: PlayerId): void;
  showTaken(player: PlayerId): void;
  showRefused(player: PlayerId, reason: string, args?: string[]): void;
}

export function gearFeedback(prefix: string): GearFeedback {
  const keyPrefix = `${NAMESPACE}.${prefix}`;

  function show(player: PlayerId, message: string, args?: string[]): void {
    const translate = `${keyPrefix}.${message}`;
    showActionBar(
      player,
      args === undefined ? { translate } : { translate, with: args },
    );
  }

  return {
    showBlocked: (player) => show(player, "blocked", []),
    showHitsLeft: (player, left) =>
      showHitsLeftHint(player, `${keyPrefix}.hits_left`, left),
    showTaken: (player) => show(player, "taken", []),
    showRefused: show,
  };
}

export function gearGroundChecks(deps: { isCampSpace: SpaceCheck }): {
  isSolidTop: SpaceCheck;
  isCampSpace: SpaceCheck;
} {
  return {
    isSolidTop: (dimension, cell) => isSolidTop(dimension, cell),
    isCampSpace: (dimension, cell) => deps.isCampSpace(dimension, cell),
  };
}
