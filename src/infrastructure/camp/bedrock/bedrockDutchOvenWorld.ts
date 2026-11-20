import { type Entity, ItemStack, world } from "@minecraft/server";
import type { DutchOvenWorld } from "../../../application/camp/ports/dutchOven";
import type { HostedKindId } from "../../../application/shared/ports/hostedItem";
import {
  asDutchOvenId,
  type DutchOvenId,
} from "../../../domain/camp/dutchOven";
import { asFirePitId, type FirePitId } from "../../../domain/camp/firePit";
import { DUTCH_OVEN_SPEC } from "../../../domain/camp/spec";
import {
  asDimensionId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type {
  LocalPoint,
  TopItem,
  TopRect,
} from "../../../domain/shared/tableTop";
import type { Vec3 } from "../../../domain/shared/vec";
import { entityOfType, spawnWithRollback } from "../../shared/entities";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import { showHitsLeftHint } from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
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
import {
  hostExists,
  isHostAreaLoaded,
  loadedEntityIds,
} from "./hostedEntities";

function dutchOven(id: DutchOvenId) {
  return entityOfType(world, id, DUTCH_OVEN_TYPE);
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

export class BedrockDutchOvenWorld
  extends BedrockPaidGroundCells
  implements DutchOvenWorld
{
  constructor(
    private readonly vehicles: {
      topHosts: TopHostRegistry;
      isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
    },
  ) {
    super(
      (dimension, cell) => vehicles.isVehicleSpace(dimension, cell),
      DUTCH_OVEN_ITEM,
    );
  }

  hasDutchOvenNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world
        .getDimension(dimension)
        .getEntities({ type: DUTCH_OVEN_TYPE, location: at, maxDistance: 0.5 })
        .length > 0
    );
  }

  spawnDutchOven(
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    setup?: (id: DutchOvenId) => void,
  ): DutchOvenId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimension),
      DUTCH_OVEN_TYPE,
      at,
      yaw,
      setup && ((oven) => setup(asDutchOvenId(oven.id))),
    );
    return entity && asDutchOvenId(entity.id);
  }

  topHost(hostType: string, id: string) {
    const host = this.vehicles.topHosts.host(hostType, id);
    return host
      ? {
          blockedAt: (at: LocalPoint, footprint: TopRect) =>
            host.type.blockedAt?.(host.entity, at, footprint) ?? false,
          dimension: asDimensionId(host.entity.dimension.id),
          at: host.entity.location,
          yaw: host.entity.getRotation().y,
        }
      : undefined;
  }

  itemsOnTop(hostType: string, id: string): readonly TopItem[] {
    return this.vehicles.topHosts.itemsOnTop(hostType, id);
  }

  spawnHosted(
    _kind: HostedKindId,
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
    host: string,
  ): DutchOvenId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimension),
      DUTCH_OVEN_TYPE,
      at,
      yaw,
      (oven) => setOvenHost(oven, host, false),
    );
    return entity && asDutchOvenId(entity.id);
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

  simmering(id: DutchOvenId): boolean | undefined {
    const oven = dutchOven(id);
    return oven
      ? oven.getProperty(DUTCH_OVEN_SIMMERING_PROPERTY) === true
      : undefined;
  }

  setSimmering(id: DutchOvenId, value: boolean): void {
    const oven = dutchOven(id);
    if (!oven) return;
    oven.setProperty(DUTCH_OVEN_SIMMERING_PROPERTY, value);
    oven.dimension.playSound(DUTCH_OVEN_SPEC.lidSound, oven.location);
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
    return hostExists(id);
  }

  isHostAreaLoaded(id: DutchOvenId): boolean {
    return isHostAreaLoaded(dutchOven(id));
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
    showHitsLeftHint(player, DUTCH_OVEN_HITS_LEFT_HINT, hitsLeft);
  }
}
