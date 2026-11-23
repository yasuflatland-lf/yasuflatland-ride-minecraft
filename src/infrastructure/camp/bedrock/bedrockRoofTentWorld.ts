import { type Entity, world } from "@minecraft/server";
import type { RoofTentWorld } from "../../../application/camp/ports/roofTent";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asRoofTentId, type RoofTentId } from "../../../domain/camp/ids";
import type {
  RoofTentPlan,
  RoofTentRefusal,
} from "../../../domain/camp/roofTent/placement";
import { ROOF_TENT_SPEC } from "../../../domain/camp/spec";
import { decodeHost, encodeHost } from "../../../domain/shared/hosted";
import {
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { PAINTS, type Paint } from "../../../domain/shared/paint";
import type { Vec3 } from "../../../domain/shared/vec";
import { blockIn } from "../../shared/blocks";
import { dyeOf, paintEvent, playPaintSound } from "../../shared/dyes";
import { entityOfType, hasEntityNear } from "../../shared/entities";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { id } from "../../shared/identifiers";
import {
  consumeHeld,
  isCreative,
  playerById,
  showActionBar,
  showHitsLeftHint,
} from "../../shared/players";
import {
  PITCH_REFUSAL_MESSAGE,
  ROOF_TENT_HOST_PROPERTY,
  ROOF_TENT_ITEM,
  ROOF_TENT_LADDER_PROPERTY,
  ROOF_TENT_OWNER_PROPERTY,
  ROOF_TENT_TYPE,
  TENT_HITS_LEFT_HINT,
} from "../identifiers";
import { loadedEntityIds } from "./hostedEntities";

const ROOF_TENT_REFUSAL_MESSAGE: Readonly<Record<RoofTentRefusal, string>> = {
  blocked: PITCH_REFUSAL_MESSAGE.blocked,
  roof_taken: PITCH_REFUSAL_MESSAGE.blocked,
  host_in_use: PITCH_REFUSAL_MESSAGE.blocked,
  unsupported_vehicle: PITCH_REFUSAL_MESSAGE.vehicle,
};

export function roofTentEntity(id: RoofTentId): Entity | undefined {
  return entityOfType(world, id, ROOF_TENT_TYPE);
}

export class BedrockRoofTentWorld implements RoofTentWorld {
  private readonly removing = new Set<RoofTentId>();

  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
      beforeRemove(tentId: RoofTentId): void;
      spawned(entity: Entity, yaw: number): void;
    },
  ) {}

  spawn(
    plan: RoofTentPlan,
    at: { dimensionId: DimensionId; location: Vec3; yaw: number },
    ownerId: PlayerId | undefined,
    paint: Paint,
  ): RoofTentId | undefined {
    let entity: Entity | undefined;
    try {
      entity = world
        .getDimension(at.dimensionId)
        .spawnEntity(ROOF_TENT_TYPE, at.location);
      entity.setRotation({ x: 0, y: at.yaw });
      entity.setProperty(ROOF_TENT_LADDER_PROPERTY, plan.ladder);
      if (plan.ladder) entity.triggerEvent(id("suv_bounds"));
      entity.setDynamicProperty(ROOF_TENT_OWNER_PROPERTY, ownerId);
      entity.setDynamicProperty(ROOF_TENT_HOST_PROPERTY, encodeHost(plan.host));
      entity.triggerEvent(paintEvent(paint));
      this.deps.spawned(entity, at.yaw);
      return asRoofTentId(entity.id);
    } catch {
      try {
        if (entity?.isValid) entity.remove();
      } catch {
        // The chunk can unload between the failed spawn setup and its cleanup.
      }
      return undefined;
    }
  }

  remove(id: RoofTentId): void {
    this.deps.beforeRemove(id);
    // The entity's before-remove event fires during removal. Cleanup has run.
    this.removing.add(id);
    try {
      roofTentEntity(id)?.remove();
    } finally {
      this.removing.delete(id);
    }
  }

  isRemoving(id: RoofTentId): boolean {
    return this.removing.has(id);
  }
  ownerOf(id: RoofTentId): PlayerId | undefined {
    const value = roofTentEntity(id)?.getDynamicProperty(
      ROOF_TENT_OWNER_PROPERTY,
    );
    return typeof value === "string" ? asPlayerId(value) : undefined;
  }
  hostOf(id: RoofTentId) {
    const value = roofTentEntity(id)?.getDynamicProperty(
      ROOF_TENT_HOST_PROPERTY,
    );
    return decodeHost(typeof value === "string" ? value : "");
  }
  returnItem(id: RoofTentId, ownerId: PlayerId | undefined): void {
    const player = giveBackReceiver(ROOF_TENT_SPEC.giveBack, ownerId);
    const receiver = player?.isValid ? player : undefined;
    const target = receiver ?? roofTentEntity(id);
    if (target) giveBack(target, ROOF_TENT_ITEM, receiver);
  }
  blockAt = blockIn;
  isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean {
    return this.deps.isVehicleSpace(dimension, cell);
  }
  isCampSpace(dimension: DimensionId, cell: Vec3): boolean {
    return this.deps.isCampSpace(dimension, cell);
  }
  hasRoofTentNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      hasEntityNear(
        dimension,
        ROOF_TENT_TYPE,
        at,
        ROOF_TENT_SPEC.groundSpacing,
      ) ?? true
    );
  }
  loaded(): readonly RoofTentId[] {
    return loadedEntityIds(ROOF_TENT_TYPE).map(asRoofTentId);
  }
  isCreative(id: PlayerId): boolean {
    return isCreative(playerById(id));
  }
  consumeItem(id: PlayerId, slot: number): boolean {
    const player = playerById(id);
    return player !== undefined && consumeHeld(player, ROOF_TENT_ITEM, slot);
  }
  giveItem(id: PlayerId): void {
    const player = playerById(id);
    if (player?.isValid) giveBack(player, ROOF_TENT_ITEM, player);
  }
  showHitsLeft(id: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(id, TENT_HITS_LEFT_HINT, hitsLeft);
  }
  showRefusal(id: PlayerId, reason: RoofTentRefusal): void {
    showActionBar(id, { translate: ROOF_TENT_REFUSAL_MESSAGE[reason] });
  }
  paintOf(id: RoofTentId): Paint | undefined {
    const tent = roofTentEntity(id);
    return tent
      ? PAINTS[tent.getComponent("minecraft:variant")?.value ?? 0]
      : undefined;
  }
  paint(id: RoofTentId, paint: Paint): void {
    const tent = roofTentEntity(id);
    if (!tent) return;
    tent.triggerEvent(paintEvent(paint));
  }
  playPaintSound(id: RoofTentId): void {
    const tent = roofTentEntity(id);
    if (tent) playPaintSound(tent);
  }
  consumeDye(id: PlayerId, paint: Paint): void {
    const player = playerById(id);
    if (player) consumeHeld(player, dyeOf(paint), player.selectedSlotIndex);
  }
}
