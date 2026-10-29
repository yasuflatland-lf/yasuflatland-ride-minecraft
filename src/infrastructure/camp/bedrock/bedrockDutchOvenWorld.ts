import { type Entity, ItemStack, world } from "@minecraft/server";
import type { DutchOvenWorld } from "../../../application/camp/ports/dutchOven";
import type { HostedKindId } from "../../../application/camp/ports/tableTop";
import {
  asDutchOvenId,
  type DutchOvenId,
} from "../../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../../domain/camp/firePit";
import type { TopItem } from "../../../domain/camp/tabletop";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_GROUND_EVENT,
  DUTCH_OVEN_HITS_LEFT_HINT,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_HOSTED_EVENT,
  DUTCH_OVEN_ITEM,
  DUTCH_OVEN_SIMMERING_PROPERTY,
  DUTCH_OVEN_TYPE,
  FIRE_PIT_TYPE,
} from "../identifiers";
import {
  firePitEntity,
  isFirePitCovered,
  setFirePitCovered,
} from "./firePitCovered";
import { itemsOnTable } from "./tableItems";

function dutchOven(id: DutchOvenId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === DUTCH_OVEN_TYPE
    ? entity
    : undefined;
}

export function setOvenHost(
  oven: Entity,
  host: string,
  simmering: boolean,
): void {
  oven.setDynamicProperty(DUTCH_OVEN_HOST_PROPERTY, host);
  oven.setProperty(DUTCH_OVEN_SIMMERING_PROPERTY, simmering);
  // Entities do not provide a supporting block surface for another entity.
  oven.triggerEvent(
    host === "" ? DUTCH_OVEN_GROUND_EVENT : DUTCH_OVEN_HOSTED_EVENT,
  );
  oven.clearVelocity();
}

function loadedEntityIds(type: string): string[] {
  return ["overworld", "nether", "the_end"].flatMap((dimension) =>
    world
      .getDimension(dimension)
      .getEntities({ type })
      .map((entity) => entity.id),
  );
}

export class BedrockDutchOvenWorld implements DutchOvenWorld {
  constructor(
    private readonly vehicles: {
      isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
    },
  ) {}

  isAir(dimension: DimensionId, at: Vec3): boolean {
    try {
      return world.getDimension(dimension).getBlock(at)?.isAir === true;
    } catch {
      return false;
    }
  }

  isOwnBlock(dimension: DimensionId, at: Vec3): boolean {
    try {
      return (
        world
          .getDimension(dimension)
          .getBlock(at)
          ?.typeId.startsWith(`${NAMESPACE}:`) === true
      );
    } catch {
      return false;
    }
  }

  isVehicleSpace(dimension: DimensionId, at: Vec3): boolean {
    return this.vehicles.isVehicleSpace(dimension, at);
  }

  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world
        .getDimension(dimension)
        .getEntities({ type: DUTCH_OVEN_TYPE, location: at, maxDistance: 0.5 })
        .length > 0
    );
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, DUTCH_OVEN_ITEM, slot);
  }

  spawnDutchOven(dimension: DimensionId, at: Vec3, yaw: number): DutchOvenId {
    const oven = world.getDimension(dimension).spawnEntity(DUTCH_OVEN_TYPE, at);
    oven.setRotation({ x: 0, y: yaw });
    return asDutchOvenId(oven.id);
  }

  table(id: string) {
    const table = world.getEntity(id);
    return table?.isValid && table.typeId === CAMP_TABLE_TYPE
      ? {
          dimension: asDimensionId(table.dimension.id),
          at: table.location,
          yaw: table.getRotation().y,
        }
      : undefined;
  }

  itemsOnTable(id: string): readonly TopItem[] {
    return itemsOnTable(id);
  }

  spawnHostedOnTable(
    _kind: HostedKindId,
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    host: string,
  ): void {
    // A table has no fire under it, so the oven never simmers there (ADR 0168).
    this.setHost(this.spawnDutchOven(dimension, at, yaw), host, false);
  }

  firePit(id: FirePitId) {
    const pit = firePitEntity(id);
    return pit
      ? {
          dimension: asDimensionId(pit.dimension.id),
          at: pit.location,
          yaw: pit.getRotation().y,
        }
      : undefined;
  }

  isCovered(id: FirePitId): boolean {
    return isFirePitCovered(id);
  }

  setCovered(id: FirePitId, covered: boolean): void {
    setFirePitCovered(id, covered);
  }

  host(id: DutchOvenId): string {
    const value = dutchOven(id)?.getDynamicProperty(DUTCH_OVEN_HOST_PROPERTY);
    return typeof value === "string" ? value : "";
  }

  setHost(id: DutchOvenId, host: string, simmering: boolean): void {
    const oven = dutchOven(id);
    if (oven) setOvenHost(oven, host, simmering);
  }

  loadedOvens(): readonly DutchOvenId[] {
    return loadedEntityIds(DUTCH_OVEN_TYPE).map(asDutchOvenId);
  }

  loadedFirePits(): readonly FirePitId[] {
    return loadedEntityIds(FIRE_PIT_TYPE).map(asFirePitId);
  }

  hostExists(id: string): boolean {
    return world.getEntity(id)?.isValid === true;
  }

  isHostAreaLoaded(id: DutchOvenId): boolean {
    const oven = dutchOven(id);
    if (!oven) return false;
    try {
      const at = oven.location;
      return (
        oven.dimension.getBlock(at) !== undefined &&
        oven.dimension.getBlock({ ...at, y: at.y - 1 }) !== undefined
      );
    } catch {
      return false;
    }
  }

  dropItem(id: DutchOvenId): void {
    const entity = dutchOven(id);
    entity?.dimension.spawnItem(
      new ItemStack(DUTCH_OVEN_ITEM, 1),
      entity.location,
    );
  }

  removeDutchOven(id: DutchOvenId): void {
    dutchOven(id)?.remove();
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: DUTCH_OVEN_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
