import {
  BlockPermutation,
  type Dimension,
  type Entity,
  world,
} from "@minecraft/server";
import { LeaveRoofTent } from "../../../application/camp/leaveRoofTent";
import type {
  OccupantEjector,
  RoofTentRemoved,
} from "../../../application/camp/ports/roofTent";
import type { RoofTentOccupantWorld } from "../../../application/camp/ports/roofTentOccupant";
import { ClearRoofTentSpawn } from "../../../application/camp/roofTentRemoved";
import type { BedWorld } from "../../../application/shared/ports/bed";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import { decodeHost } from "../../../domain/camp/hosted";
import { roofTentCeilingCells } from "../../../domain/camp/roofTent/ceiling";
import { exitCell } from "../../../domain/camp/roofTent/exitCell";
import { snapYaw4 } from "../../../domain/camp/roofTent/facing";
import { seatPosition } from "../../../domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../domain/camp/spec";
import { type Cell, cellKey } from "../../../domain/shared/cells";
import { CLEARABLE_DECORATIONS } from "../../../domain/shared/decorations";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { forward, type Vec3 } from "../../../domain/shared/vec";
import { messageKey, NAMESPACE } from "../../shared/identifiers";
import { playerById } from "../../shared/players";
import {
  ROOF_TENT_CEILING_PROPERTY,
  ROOF_TENT_EXIT_PROPERTY,
  ROOF_TENT_FLAP_OPEN_PROPERTY,
  ROOF_TENT_HOST_PROPERTY,
  ROOF_TENT_LADDER_PROPERTY,
  ROOF_TENT_OCCUPANT_PROPERTY,
  ROOF_TENT_OCCUPIED_PROPERTY,
  ROOF_TENT_SPAWN_SET_BY_PROPERTY,
  TENT_CEILING_BLOCK,
} from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";

interface Snapshot {
  ceiling: Cell[];
  dimension: Dimension;
  location: Vec3;
  exit: Vec3;
  occupant: PlayerId | undefined;
  spawnSetBy: PlayerId | undefined;
}

export class BedrockRoofTentOccupantWorld
  implements RoofTentOccupantWorld, OccupantEjector, RoofTentRemoved
{
  private readonly snapshots = new Map<string, Snapshot>();
  private readonly clearSpawn: ClearRoofTentSpawn;
  constructor(
    private readonly vehicleHost: VehicleHostLookup,
    bed: BedWorld,
    private readonly isVehicleSpace: SpaceCheck,
  ) {
    this.clearSpawn = new ClearRoofTentSpawn(this, bed);
  }

  remember(entity: Entity, saveExit = false, spawnYaw?: number): void {
    const hostMarker = entity.getDynamicProperty(ROOF_TENT_HOST_PROPERTY);
    const host = decodeHost(typeof hostMarker === "string" ? hostMarker : "");
    const yaw = spawnYaw ?? entity.getRotation().y;
    const direction = forward(yaw);
    let exit = {
      x: Math.floor(entity.location.x + direction.x * 2),
      y: Math.floor(entity.location.y),
      z: Math.floor(entity.location.z + direction.z * 2),
    };
    const saved = entity.getDynamicProperty(ROOF_TENT_EXIT_PROPERTY);
    if (typeof saved === "string") {
      try {
        const value = JSON.parse(saved) as Vec3;
        if ([value.x, value.y, value.z].every(Number.isFinite)) exit = value;
      } catch {
        /* Ignore a malformed saved exit and derive it from the pose. */
      }
    }
    if (host.kind === "vehicle") {
      const state = this.vehicleHost(host.id);
      if (state.status === "present" && state.mount)
        exit = exitCell(state.mount, state, snapYaw4(yaw));
    }
    if (saveExit)
      entity.setDynamicProperty(ROOF_TENT_EXIT_PROPERTY, JSON.stringify(exit));
    const occupant = entity.getDynamicProperty(ROOF_TENT_OCCUPANT_PROPERTY);
    const spawnSetBy = entity.getDynamicProperty(
      ROOF_TENT_SPAWN_SET_BY_PROPERTY,
    );
    this.snapshots.set(entity.id, {
      ceiling: readCeiling(
        entity.getDynamicProperty(ROOF_TENT_CEILING_PROPERTY),
      ),
      dimension: entity.dimension,
      location: { ...entity.location },
      exit,
      occupant: typeof occupant === "string" ? asPlayerId(occupant) : undefined,
      spawnSetBy:
        typeof spawnSetBy === "string" ? asPlayerId(spawnSetBy) : undefined,
    });
  }
  forget(id: string): void {
    this.clearCeiling(id);
    const occupant = this.snapshots.get(id)?.occupant;
    if (occupant !== undefined) this.reveal(occupant);
    this.snapshots.delete(id);
  }
  private snapshot(id: string): Snapshot | undefined {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    return this.snapshots.get(id);
  }
  occupantOf(id: string): PlayerId | undefined {
    return this.snapshot(id)?.occupant;
  }
  setOccupant(id: string, playerId: PlayerId | undefined): void {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    entity?.setDynamicProperty(ROOF_TENT_OCCUPANT_PROPERTY, playerId);
    entity?.setProperty(ROOF_TENT_OCCUPIED_PROPERTY, playerId !== undefined);
    entity?.setProperty(ROOF_TENT_FLAP_OPEN_PROPERTY, playerId !== undefined);
    const saved = this.snapshots.get(id);
    if (saved) saved.occupant = playerId;
    this.syncCeiling(id);
  }
  syncCeiling(id: string): void {
    const tent = this.snapshot(id);
    if (!tent) return;
    if (tent.occupant === undefined) {
      if (tent.ceiling.length > 0) this.clearCeiling(id);
      return;
    }
    this.layCeiling(id, tent);
  }
  private layCeiling(id: string, tent: Snapshot): void {
    let warned = false;
    const warn = (error: unknown) => {
      if (!warned)
        console.warn(`[${NAMESPACE}] roof tent ceiling lay failed: ${error}`);
      warned = true;
    };
    try {
      const entity = roofTentEntity(id);
      if (!entity) return;
      const variant =
        entity.getProperty(ROOF_TENT_LADDER_PROPERTY) === true
          ? "suv"
          : "ground";
      const recorded = new Map(
        tent.ceiling.map((cell) => [cellKey(cell), cell]),
      );
      for (const cell of roofTentCeilingCells(
        entity.location,
        entity.getRotation().y,
        variant,
      )) {
        try {
          if (this.isVehicleSpace(asDimensionId(tent.dimension.id), cell))
            continue;
          const block = tent.dimension.getBlock(cell);
          if (!block) continue;
          if (
            block.typeId === TENT_CEILING_BLOCK &&
            recorded.has(cellKey(cell))
          )
            continue;
          if (!block.isAir) continue;
          block.setPermutation(BlockPermutation.resolve(TENT_CEILING_BLOCK));
          recorded.set(cellKey(cell), cell);
          // Keep the fallback record even if saving the entity property fails.
          tent.ceiling = [...recorded.values()];
        } catch (error) {
          warn(error);
        }
      }
      entity.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        tent.ceiling.length > 0 ? JSON.stringify(tent.ceiling) : undefined,
      );
    } catch (error) {
      warn(error);
    }
  }
  private clearCeiling(id: string): void {
    const tent = this.snapshots.get(id);
    if (!tent || tent.ceiling.length === 0) return;
    let warned = false;
    const warn = (error: unknown) => {
      if (!warned)
        console.warn(`[${NAMESPACE}] roof tent ceiling clear failed: ${error}`);
      warned = true;
    };
    for (const cell of tent.ceiling) {
      try {
        const block = tent.dimension.getBlock(cell);
        if (block?.typeId === TENT_CEILING_BLOCK)
          block.setPermutation(BlockPermutation.resolve("minecraft:air"));
      } catch (error) {
        warn(error);
      }
    }
    tent.ceiling = [];
    try {
      roofTentEntity(id)?.setDynamicProperty(
        ROOF_TENT_CEILING_PROPERTY,
        undefined,
      );
    } catch (error) {
      warn(error);
    }
  }
  ceilingOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    if (typeId !== TENT_CEILING_BLOCK) return undefined;
    for (const [id, tent] of this.snapshots) {
      if (
        tent.dimension.id === dimensionId &&
        tent.ceiling.some((at) => cellKey(at) === cellKey(cell))
      )
        return id;
    }
    return undefined;
  }
  moveInside(playerId: PlayerId, id: string): void {
    const tent = this.snapshot(id);
    const entity = roofTentEntity(id);
    const player = world.getEntity(playerId);
    if (!tent || !player?.isValid) return;
    if (this.isSeated(playerId, id) === true) return;
    const teleport = () =>
      player.teleport(seatPosition(tent.location), {
        dimension: tent.dimension,
      });
    // addRider needs a nearby rider in the tent's dimension.
    teleport();
    try {
      const rideable = entity?.getComponent("minecraft:rideable");
      if (rideable && !rideable.addRider(player)) teleport();
    } catch (error) {
      console.warn(`[${NAMESPACE}] roof tent seating failed: ${error}`);
      teleport();
    }
  }
  conceal(playerId: PlayerId): void {
    try {
      const player = playerById(playerId);
      if (!player?.isValid) return;
      player.addEffect("invisibility", ROOF_TENT_SPEC.concealTicks, {
        amplifier: 0,
        showParticles: false,
      });
    } catch (error) {
      console.warn(`[${NAMESPACE}] roof tent conceal failed: ${error}`);
    }
  }
  reveal(playerId: PlayerId): void {
    try {
      // Effects have no source attribution, so this also removes potion invisibility.
      const player = playerById(playerId);
      if (player?.isValid) player.removeEffect("invisibility");
    } catch (error) {
      console.warn(`[${NAMESPACE}] roof tent reveal failed: ${error}`);
    }
  }
  isSeated(playerId: PlayerId, id: string): boolean | undefined {
    if (!roofTentEntity(id)) return undefined;
    return (
      world.getEntity(playerId)?.getComponent("minecraft:riding")
        ?.entityRidingOn?.id === id
    );
  }
  placeOutside(playerId: PlayerId, id: string): void {
    const tent = this.snapshot(id);
    const occupant = world.getEntity(playerId);
    if (!tent || !occupant?.isValid) return;
    // Search around the saved entrance at ground height, including when the host
    // has already disappeared. Never fall back to teleporting onto the roof.
    for (let radius = 0; radius <= 4; radius++) {
      for (let dx = -radius; dx <= radius; dx++)
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          for (let dy = 4; dy >= -8; dy--) {
            const feet = {
              x: tent.exit.x + dx,
              y: tent.exit.y + dy,
              z: tent.exit.z + dz,
            };
            try {
              const floor = tent.dimension.getBlock({ ...feet, y: feet.y - 1 });
              if (this.isVehicleSpace(asDimensionId(tent.dimension.id), feet))
                continue;
              if (
                !floor ||
                floor.isAir ||
                floor.isLiquid ||
                CLEARABLE_DECORATIONS.has(floor.typeId)
              )
                continue;
              if (
                tent.dimension.getBlock(feet)?.isAir !== true ||
                tent.dimension.getBlock({ ...feet, y: feet.y + 1 })?.isAir !==
                  true
              )
                continue;
              occupant
                .getComponent("minecraft:riding")
                ?.entityRidingOn?.getComponent("minecraft:rideable")
                ?.ejectRider(occupant);
              occupant.teleport(
                { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 },
                { dimension: tent.dimension },
              );
              return;
            } catch {
              /* Unloaded terrain cannot be a safe exit. */
            }
          }
        }
    }
  }
  spawnCellOf(id: string): Vec3 {
    const location = this.snapshot(id)?.location;
    if (!location) throw new Error(`Unknown roof tent: ${id}`);
    return {
      x: Math.floor(location.x),
      y: Math.floor(location.y),
      z: Math.floor(location.z),
    };
  }
  spawnSetBy(id: string): PlayerId | undefined {
    return this.snapshot(id)?.spawnSetBy;
  }
  setSpawnSetBy(id: string, playerId: PlayerId | undefined): void {
    roofTentEntity(id)?.setDynamicProperty(
      ROOF_TENT_SPAWN_SET_BY_PROPERTY,
      playerId,
    );
    const saved = this.snapshots.get(id);
    if (saved) saved.spawnSetBy = playerId;
  }
  dimensionOf(id: string) {
    const saved = this.snapshot(id);
    if (!saved) throw new Error(`Unknown roof tent: ${id}`);
    return asDimensionId(saved.dimension.id);
  }
  showMessage(playerId: PlayerId, name: string): void {
    playerById(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }
  eject(id: string): void {
    new LeaveRoofTent(this).eject(id);
  }
  removed(id: string, ownerId: string | undefined): void {
    this.eject(id);
    this.clearCeiling(id);
    this.clearSpawn.removed(id, ownerId);
    this.forget(id);
  }
}

function readCeiling(saved: unknown): Cell[] {
  if (typeof saved !== "string") return [];
  try {
    const value: unknown = JSON.parse(saved);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (cell): cell is Cell =>
        cell !== null &&
        typeof cell === "object" &&
        [cell.x, cell.y, cell.z].every(Number.isSafeInteger),
    );
  } catch {
    return [];
  }
}
