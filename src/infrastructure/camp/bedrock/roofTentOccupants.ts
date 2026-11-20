import { type Dimension, type Entity, world } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import { asRoofTentId, type RoofTentId } from "../../../domain/camp/ids";
import { exitCell } from "../../../domain/camp/roofTent/exitCell";
import {
  chooseExit,
  fallbackExit,
  mergeSpawnSetters,
  type RoofTentState,
  roofTentState,
  withOccupant,
} from "../../../domain/camp/roofTent/occupancy";
import { seatPosition } from "../../../domain/camp/roofTent/seat";
import { ROOF_TENT_SPEC } from "../../../domain/camp/spec";
import { type Cell, cellCenter, sameCell } from "../../../domain/shared/cells";
import { searchExitCell } from "../../../domain/shared/exitSearch";
import { snapYaw4 } from "../../../domain/shared/facing";
import { decodeHost } from "../../../domain/shared/hosted";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { messageKey, NAMESPACE } from "../../shared/identifiers";
import { readSavedCells } from "../../shared/laidBlockLayer";
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
import {
  decodeExit,
  decodeSpawnSetters,
  encodeExit,
} from "../persistence/roofTentState";
import { roofTentEntity } from "./bedrockRoofTentWorld";

interface RoofTentRecord {
  state: RoofTentState;
  readonly dimension: Dimension;
  readonly location: Vec3;
  ceiling: readonly Cell[];
}

export class RoofTentOccupants {
  private readonly records = new Map<RoofTentId, RoofTentRecord>();
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
    const location = { ...entity.location };
    const vehicle =
      host.kind === "vehicle" ? this.vehicleHost(host.id) : undefined;
    const exit = chooseExit({
      host:
        vehicle?.status === "present" && vehicle.mount
          ? exitCell(vehicle.mount, vehicle, snapYaw4(yaw))
          : undefined,
      saved: decodeExit(entity.getDynamicProperty(ROOF_TENT_EXIT_PROPERTY)),
      fallback: fallbackExit(location, yaw),
    });
    if (saveExit)
      entity.setDynamicProperty(ROOF_TENT_EXIT_PROPERTY, encodeExit(exit));
    const occupant = entity.getDynamicProperty(ROOF_TENT_OCCUPANT_PROPERTY);
    const legacy = entity.getDynamicProperty(ROOF_TENT_SPAWN_SET_BY_PROPERTY);
    const stored = decodeSpawnSetters(
      entity.getDynamicProperty(ROOF_TENT_SPAWN_SETTERS_PROPERTY),
    );
    this.records.set(asRoofTentId(entity.id), {
      ceiling: readSavedCells(
        entity.getDynamicProperty(ROOF_TENT_CEILING_PROPERTY),
      ),
      dimension: entity.dimension,
      location,
      state: roofTentState({
        exit,
        occupant:
          typeof occupant === "string" ? asPlayerId(occupant) : undefined,
        spawnSetters: mergeSpawnSetters(
          stored,
          typeof legacy === "string" ? asPlayerId(legacy) : undefined,
        ),
      }),
    });
  }

  record(id: RoofTentId): Readonly<RoofTentRecord> | undefined {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    return this.peek(id);
  }

  peek(id: RoofTentId): Readonly<RoofTentRecord> | undefined {
    return this.records.get(id);
  }

  updateState(
    id: RoofTentId,
    change: (state: RoofTentState) => RoofTentState,
  ): void {
    const record = this.records.get(id);
    if (record) record.state = change(record.state);
  }

  setCeiling(id: RoofTentId, cells: readonly Cell[]): void {
    const record = this.records.get(id);
    if (record) record.ceiling = [...cells];
  }

  ceilingOwner(dimensionId: DimensionId, cell: Cell): RoofTentId | undefined {
    for (const [id, tent] of this.records) {
      if (
        tent.dimension.id === dimensionId &&
        tent.ceiling.some((at) => sameCell(at, cell))
      )
        return id;
    }
    return undefined;
  }

  forget(id: RoofTentId): void {
    const occupant = this.peek(id)?.state.occupant;
    if (occupant !== undefined) this.reveal(occupant);
    this.records.delete(id);
  }

  occupantOf(id: RoofTentId): PlayerId | undefined {
    return this.record(id)?.state.occupant;
  }

  setOccupant(id: RoofTentId, playerId: PlayerId | undefined): void {
    const entity = roofTentEntity(id);
    if (entity) this.remember(entity);
    entity?.setDynamicProperty(ROOF_TENT_OCCUPANT_PROPERTY, playerId);
    entity?.setProperty(ROOF_TENT_OCCUPIED_PROPERTY, playerId !== undefined);
    entity?.setProperty(ROOF_TENT_FLAP_OPEN_PROPERTY, playerId !== undefined);
    this.updateState(id, (state) => withOccupant(state, playerId));
    this.syncCeiling(id);
  }

  moveInside(playerId: PlayerId, id: RoofTentId): void {
    const tent = this.record(id);
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
    const tent = this.record(id);
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
      tent.state.exit,
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
