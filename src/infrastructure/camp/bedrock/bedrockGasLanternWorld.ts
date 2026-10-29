import { ItemStack, world } from "@minecraft/server";
import type { GasLanternWorld } from "../../../application/camp/ports/gasLantern";
import {
  asGasLanternId,
  type GasLanternId,
  type GasLanternLight,
  gasLanternLightCells,
} from "../../../domain/camp/gasLantern";
import { GAS_LANTERN_SPEC } from "../../../domain/camp/spec";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { NAMESPACE } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { consumeHeld, isCreative, playerById } from "../../shared/players";
import {
  GAS_LANTERN_HITS_LEFT_HINT,
  GAS_LANTERN_ITEM,
  GAS_LANTERN_LIT_PROPERTY,
  GAS_LANTERN_TYPE,
  SWITCH_CLICK_SOUND,
} from "../identifiers";

function gasLantern(id: GasLanternId) {
  const entity = world.getEntity(id);
  return entity?.isValid && entity.typeId === GAS_LANTERN_TYPE
    ? entity
    : undefined;
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
    world
      .getDimension(dimension)
      .spawnEntity(GAS_LANTERN_TYPE, at)
      .setRotation({ x: 0, y: yaw });
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

  showHitsLeft(player: PlayerId, hitsLeft: number): void {
    playerById(player)?.onScreenDisplay.setActionBar({
      translate: GAS_LANTERN_HITS_LEFT_HINT,
      with: [String(hitsLeft)],
    });
  }
}
