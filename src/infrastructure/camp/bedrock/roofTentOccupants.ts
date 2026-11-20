import { type Dimension, type Entity, world } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import { asRoofTentId, type RoofTentId } from "../../../domain/camp/ids";
import { exitCell } from "../../../domain/camp/roofTent/exitCell";
import { seatPosition } from "../../../domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../domain/camp/spec";
import { type Cell, cellCenter, cellOf } from "../../../domain/shared/cells";
import { searchExitCell } from "../../../domain/shared/exitSearch";
import { snapYaw4 } from "../../../domain/shared/facing";
import { decodeHost } from "../../../domain/shared/hosted";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { forward, type Vec3 } from "../../../domain/shared/vec";
import { messageKey, NAMESPACE } from "../../shared/identifiers";
import { readCeilingCells } from "../../shared/laidBlockLayer";
import { playerById, showActionBar } from "../../shared/players";
import { makeSafeStand } from "../../shared/seating";
import {
  ROOF_TENT_CEILING_PROPERTY,
  ROOF_TENT_EXIT_PROPERTY,
  ROOF_TENT_FLAP_OPEN_PROPERTY,
  ROOF_TENT_HOST_PROPERTY,
  ROOF_TENT_OCCUPANT_PROPERTY,
  ROOF_TENT_OCCUPIED_PROPERTY,
  ROOF_TENT_SPAWN_SET_BY_PROPERTY,
  ROOF_TENT_SPAWN_SETTERS_PROPERTY,
} from "../identifiers";
import { roofTentEntity } from "./bedrockRoofTentWorld";

export interface RoofTentSnapshot {
  ceiling: Cell[];
  dimension: Dimension;
  location: Vec3;
  exit: Vec3;
  occupant: PlayerId | undefined;
  spawnSetters: readonly PlayerId[];
}

export class RoofTentOccupants {
  readonly snapshots = new Map<RoofTentId, RoofTentSnapshot>();
  constructor(
    private readonly vehicleHost: VehicleHostLookup,
    private readonly isVehicleSpace: SpaceCheck,
    private readonly isCampSpace: SpaceCheck,
    private readonly syncCeiling: (id: RoofTentId) => void,
  ) {}

  remember(entity: Entity, saveExit = false, spawnYaw?: number): void {
    const hostMarker = entity.getDynamicProperty(ROOF_TENT_HOST_PROPERTY);
    const host = decodeHost(typeof hostMarker === "string" ? hostMarker : "");
    const yaw = spawnYaw ?? entity.getRotation().y;
    const direction = forward(yaw);
    let exit = cellOf({
      x: entity.location.x + direction.x * ROOF_TENT_SPEC.exitFallbackDistance,
      y: entity.location.y,
      z: entity.location.z + direction.z * ROOF_TENT_SPEC.exitFallbackDistance,
    });
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
    const legacy = entity.getDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY);
    let stored: PlayerId[] = [];
    const savedSetters = entity.getDynamicProperty(
      ROOF_TENT_SPAWN_SETTERS_PROPERTY,
    );
    if (typeof savedSetters === "string") {
      try {
        const value: unknown = JSON.parse(savedSetters);
        if (Array.isArray(value) && value.every((id) => typeof id === "string"))
          stored = value.map(asPlayerId);
      } catch {
        /* A malformed array still leaves the legacy setter below. */
      }
    }
    // The legacy key is merged rather than used as a fallback only, because an
    // older pack may have written a newer sleeper there without updating the array.
    const spawnSetters = [
      ...new Set(
        typeof legacy === "string" ? [...stored, asPlayerId(legacy)] : stored,
      ),
    ];
    this.snapshots.set(asRoofTentId(entity.id), {
      ceiling: readCeilingCells(
        entity.getDynamicProperty(ROOF_TENT_CEILING_PROPERTY),
      ),
      dimension: entity.dimension,
      location: { ...entity.location },
      exit,
      occupant: typeof occupant === "string" ? asPlayerId(occupant) : undefined,
      spawnSetters,
    });
  }

  forget(id: RoofTentId): void {
    const occupant = this.snapshots.get(id)?.occupant;
    if (occupant !== undefined) this.reveal(occupant);
    this.snapshots.delete(id);
  }

  snapshot(id: RoofTentId): RoofTentSnapshot | undefined {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    return this.snapshots.get(id);
  }

  occupantOf(id: RoofTentId): PlayerId | undefined {
    return this.snapshot(id)?.occupant;
  }

  setOccupant(id: RoofTentId, playerId: PlayerId | undefined): void {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    entity?.setDynamicProperty(ROOF_TENT_OCCUPANT_PROPERTY, playerId);
    entity?.setProperty(ROOF_TENT_OCCUPIED_PROPERTY, playerId !== undefined);
    entity?.setProperty(ROOF_TENT_FLAP_OPEN_PROPERTY, playerId !== undefined);
    const saved = this.snapshots.get(id);
    if (saved) saved.occupant = playerId;
    this.syncCeiling(id);
  }

  moveInside(playerId: PlayerId, id: RoofTentId): void {
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
      if (rideable && !rideable.addRider(player)) {
        console.warn(`[${NAMESPACE}] roof tent rejected its rider`);
        teleport();
      } else if (!rideable) {
        console.warn(`[${NAMESPACE}] roof tent has no rideable component`);
      }
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

  isSeated(playerId: PlayerId, id: RoofTentId): boolean | undefined {
    if (!roofTentEntity(id)) return undefined;
    return (
      world.getEntity(playerId)?.getComponent("minecraft:riding")
        ?.entityRidingOn?.id === id
    );
  }

  placeOutside(playerId: PlayerId, id: RoofTentId): void {
    const tent = this.snapshot(id);
    const occupant = world.getEntity(playerId);
    if (!tent || !occupant?.isValid) return;
    // Search around the saved entrance at ground height, including when the host
    // has already disappeared. Never fall back to teleporting onto the roof.
    const dimensionId = asDimensionId(tent.dimension.id);
    const isSafe = makeSafeStand({
      isVehicleSpace: (c) => this.isVehicleSpace(dimensionId, c),
      isCampSpace: (c) => this.isCampSpace(dimensionId, c),
    });
    const feet = searchExitCell(
      tent.exit,
      () => false,
      ROOF_TENT_SPEC.exitSearch,
      (c) => isSafe(tent.dimension, c),
    );
    if (!feet) return;
    occupant
      .getComponent("minecraft:riding")
      ?.entityRidingOn?.getComponent("minecraft:rideable")
      ?.ejectRider(occupant);
    occupant.teleport(cellCenter(feet), { dimension: tent.dimension });
  }

  showMessage(playerId: PlayerId, name: string): void {
    showActionBar(playerId, {
      translate: messageKey(name),
    });
  }
}
