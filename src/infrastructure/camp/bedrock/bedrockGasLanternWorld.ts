import { ItemStack, world } from "@minecraft/server";
import type { GasLanternWorld } from "../../../application/camp/ports/gasLantern";
import type { HostedKindId } from "../../../application/shared/ports/hostedItem";
import {
  asGasLanternId,
  type GasLanternId,
  type GasLanternLight,
  gasLanternLightCells,
} from "../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../domain/camp/spec";
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
import { allDimensions } from "../../shared/dimensions";
import { entityOfType, spawnWithRollback } from "../../shared/entities";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import type { CellLayer } from "../../shared/laidCells";
import { showHitsLeftHint } from "../../shared/players";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  GAS_LANTERN_HITS_LEFT_HINT,
  GAS_LANTERN_HOST_PROPERTY,
  GAS_LANTERN_HOSTED_EVENT,
  GAS_LANTERN_ITEM,
  GAS_LANTERN_LIT_PROPERTY,
  GAS_LANTERN_TYPE,
  SWITCH_CLICK_SOUND,
} from "../identifiers";
import {
  hostExists,
  isHostAreaLoaded,
  loadedEntityIds,
} from "./hostedEntities";

function gasLantern(id: GasLanternId) {
  return entityOfType(world, id, GAS_LANTERN_TYPE);
}

export class BedrockGasLanternWorld
  extends BedrockPaidGroundCells
  implements GasLanternWorld
{
  constructor(
    private readonly vehicles: {
      topHosts: TopHostRegistry;
      isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
    },
    private readonly light: CellLayer<GasLanternId, GasLanternLight>,
  ) {
    super(
      (dimension, cell) => vehicles.isVehicleSpace(dimension, cell),
      GAS_LANTERN_ITEM,
    );
  }

  hasGasLanternNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world.getDimension(dimension).getEntities({
        type: GAS_LANTERN_TYPE,
        location: at,
        maxDistance: GAS_LANTERN_SPEC.spacing,
      }).length > 0
    );
  }

  spawnGasLantern(
    dimension: DimensionId,
    at: Vec3,
    yaw: number,
  ): GasLanternId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimension),
      GAS_LANTERN_TYPE,
      at,
      yaw,
    );
    return entity && asGasLanternId(entity.id);
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
  ): GasLanternId | undefined {
    const entity = spawnWithRollback(
      world.getDimension(dimension),
      GAS_LANTERN_TYPE,
      at,
      yaw,
      (lantern) => {
        lantern.setDynamicProperty(GAS_LANTERN_HOST_PROPERTY, host);
        // Entities do not provide a supporting block surface for another entity.
        lantern.triggerEvent(GAS_LANTERN_HOSTED_EVENT);
        lantern.clearVelocity();
      },
    );
    return entity && asGasLanternId(entity.id);
  }

  isLit(id: GasLanternId): boolean | undefined {
    const entity = gasLantern(id);
    return entity
      ? entity.getProperty(GAS_LANTERN_LIT_PROPERTY) === true
      : undefined;
  }

  setLit(id: GasLanternId, on: boolean): void {
    const entity = gasLantern(id);
    if (!entity) return;
    entity.setProperty(GAS_LANTERN_LIT_PROPERTY, on);
    entity.dimension.playSound(SWITCH_CLICK_SOUND, entity.location);
  }

  // A property set this tick can still read back as the old value, so a
  // switch passes the state it just set instead of reading it again.
  relayLight(id: GasLanternId, lit?: boolean): void {
    const entity = gasLantern(id);
    if (!entity) return;
    const on = lit ?? entity.getProperty(GAS_LANTERN_LIT_PROPERTY) === true;
    this.light.lay(id, entity, gasLanternLightCells(on, entity.location));
  }

  clearLight(id: GasLanternId): void {
    this.light.lay(id, gasLantern(id), []);
  }

  relayLoaded(): void {
    const live = new Set<GasLanternId>();
    for (const dimension of allDimensions()) {
      for (const entity of dimension.getEntities({ type: GAS_LANTERN_TYPE })) {
        const id = asGasLanternId(entity.id);
        live.add(id);
        this.relayLight(id);
      }
    }
    this.light.clearGone(live);
  }

  dropItem(id: GasLanternId): void {
    const entity = gasLantern(id);
    entity?.dimension.spawnItem(
      new ItemStack(GAS_LANTERN_ITEM, 1),
      entity.location,
    );
  }

  removeGasLantern(id: GasLanternId): void {
    gasLantern(id)?.remove();
  }

  loadedGasLanterns(): readonly GasLanternId[] {
    return loadedEntityIds(GAS_LANTERN_TYPE).map(asGasLanternId);
  }

  host(id: GasLanternId): string {
    const value = gasLantern(id)?.getDynamicProperty(GAS_LANTERN_HOST_PROPERTY);
    return typeof value === "string" ? value : "";
  }

  isHostAreaLoaded(id: GasLanternId): boolean {
    return isHostAreaLoaded(gasLantern(id));
  }

  hostExists(hostId: string): boolean {
    return hostExists(hostId);
  }

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    showHitsLeftHint(player, GAS_LANTERN_HITS_LEFT_HINT, hitsLeft);
  }
}
