import { ItemStack, world } from "@minecraft/server";
import type { GasLanternWorld } from "../../../application/camp/ports/gasLantern";
import type { HostedKindId } from "../../../application/camp/ports/tableTop";
import {
  asGasLanternId,
  type GasLanternId,
  type GasLanternLight,
  gasLanternLightCells,
} from "../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../domain/camp/spec";
import type { TopItem } from "../../../domain/camp/tabletop";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
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
import { itemsOnTable, tableTop } from "./tableItems";

function gasLantern(id: GasLanternId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === GAS_LANTERN_TYPE
    ? entity
    : undefined;
}

function spawnLantern(dimension: DimensionId, at: Vec3, yaw: number) {
  const lantern = world
    .getDimension(dimension)
    .spawnEntity(GAS_LANTERN_TYPE, at);
  lantern.setRotation({ x: 0, y: yaw });
  return lantern;
}

export class BedrockGasLanternWorld implements GasLanternWorld {
  constructor(
    private readonly vehicles: {
      isVehicleSpace(dimension: DimensionId, cell: Vec3): boolean;
    },
    private readonly light: CellLayer<GasLanternId, GasLanternLight>,
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

  hasGasLanternNear(dimension: DimensionId, at: Vec3): boolean {
    return (
      world.getDimension(dimension).getEntities({
        type: GAS_LANTERN_TYPE,
        location: at,
        maxDistance: GAS_LANTERN_SPEC.spacing,
      }).length > 0
    );
  }

  isCreative(player: PlayerId): boolean {
    return isCreative(playerById(player));
  }

  consumeItem(player: PlayerId, slot: number): boolean {
    const entity = playerById(player);
    return entity !== undefined && consumeHeld(entity, GAS_LANTERN_ITEM, slot);
  }

  spawnGasLantern(dimension: DimensionId, at: Vec3, yaw: number): void {
    spawnLantern(dimension, at, yaw);
  }

  table(id: string) {
    return tableTop(id);
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
    const lantern = spawnLantern(dimension, at, yaw);
    lantern.setDynamicProperty(GAS_LANTERN_HOST_PROPERTY, host);
    // Entities do not provide a supporting block surface for another entity.
    lantern.triggerEvent(GAS_LANTERN_HOSTED_EVENT);
    lantern.clearVelocity();
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
    for (const dimension of ["overworld", "nether", "the_end"]) {
      for (const entity of world
        .getDimension(dimension)
        .getEntities({ type: GAS_LANTERN_TYPE })) {
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
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: GAS_LANTERN_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
