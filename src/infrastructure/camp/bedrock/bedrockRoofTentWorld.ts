import { type Entity, ItemStack, world } from "@minecraft/server";
import type { RoofTentWorld } from "../../../application/camp/ports/roofTent";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asRoofTentId, type RoofTentId } from "../../../domain/camp/ids";
import type { RoofTentPlan } from "../../../domain/camp/roofTent/placement";
import { CLEARABLE_DECORATIONS } from "../../../domain/shared/decorations";
import { decodeHost, encodeHost } from "../../../domain/shared/hosted";
import {
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { PAINTS, type Paint } from "../../../domain/shared/paint";
import type { Vec3 } from "../../../domain/shared/vec";
import { dyeOf, paintEvent, playPaintSound } from "../../shared/dyes";
import { entityOfType } from "../../shared/entities";
import { id, messageKey } from "../../shared/identifiers";
import {
  consumeHeld,
  giveOrDrop,
  isCreative,
  playerById,
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

export function roofTentEntity(id: RoofTentId): Entity | undefined {
  return entityOfType(world, id, ROOF_TENT_TYPE);
}

export class BedrockRoofTentWorld implements RoofTentWorld {
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
    roofTentEntity(id)?.remove();
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
    const player = ownerId === undefined ? undefined : playerById(ownerId);
    const item = new ItemStack(ROOF_TENT_ITEM, 1);
    if (player?.isValid) giveOrDrop(player, [item]);
    else {
      const tent = roofTentEntity(id);
      tent?.dimension.spawnItem(item, tent.location);
    }
  }
  groundFree(dimensionId: DimensionId, cell: Vec3): boolean {
    try {
      const dimension = world.getDimension(dimensionId);
      const ground = dimension.getBlock(cell);
      if (
        !ground ||
        ground.isAir ||
        ground.isLiquid ||
        CLEARABLE_DECORATIONS.has(ground.typeId)
      )
        return false;
      // The fixed two-block box reaches into the cells beside its center.
      for (const dx of [-1, 0, 1])
        for (const dz of [-1, 0, 1])
          for (const dy of [1, 2]) {
            const at = { x: cell.x + dx, y: cell.y + dy, z: cell.z + dz };
            if (
              dimension.getBlock(at)?.isAir !== true ||
              this.deps.isVehicleSpace(dimensionId, at) ||
              this.deps.isCampSpace(dimensionId, at)
            )
              return false;
          }
      return (
        dimension.getEntities({
          type: ROOF_TENT_TYPE,
          location: { x: cell.x + 0.5, y: cell.y + 1, z: cell.z + 0.5 },
          maxDistance: 2,
        }).length === 0
      );
    } catch {
      return false;
    }
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
    if (player?.isValid) giveOrDrop(player, [new ItemStack(ROOF_TENT_ITEM, 1)]);
  }
  showMessage(id: PlayerId, name: string): void {
    const hits = name.split(":")[1];
    const refusals: Readonly<Record<string, string>> = {
      blocked: PITCH_REFUSAL_MESSAGE.blocked,
      roof_taken: PITCH_REFUSAL_MESSAGE.blocked,
      host_in_use: PITCH_REFUSAL_MESSAGE.blocked,
      unsupported_vehicle: PITCH_REFUSAL_MESSAGE.vehicle,
    };
    playerById(id)?.onScreenDisplay.setActionBar(
      hits === undefined
        ? { translate: refusals[name] ?? messageKey(name) }
        : { translate: TENT_HITS_LEFT_HINT, with: [hits] },
    );
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
