import type { Entity } from "@minecraft/server";
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
import type { RoofTentId } from "../../../domain/camp/ids";
import type { Cell } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import { RoofTentCeiling } from "./roofTentCeiling";
import { RoofTentOccupants } from "./roofTentOccupants";
import { RoofTentSpawn } from "./roofTentSpawn";
export class BedrockRoofTentOccupantWorld
  implements RoofTentOccupantWorld, OccupantEjector, RoofTentRemoved
{
  private readonly occupants: RoofTentOccupants;
  private readonly ceiling: RoofTentCeiling;
  private readonly spawn: RoofTentSpawn;
  private readonly clearSpawn: ClearRoofTentSpawn;
  constructor(
    vehicleHost: VehicleHostLookup,
    bed: BedWorld,
    isVehicleSpace: SpaceCheck,
  ) {
    this.occupants = new RoofTentOccupants(vehicleHost, isVehicleSpace, (id) =>
      this.syncCeiling(id),
    );
    this.ceiling = new RoofTentCeiling(this.occupants, isVehicleSpace);
    this.spawn = new RoofTentSpawn(this.occupants);
    this.clearSpawn = new ClearRoofTentSpawn(this, bed);
  }

  remember(entity: Entity, saveExit = false, spawnYaw?: number): void {
    this.occupants.remember(entity, saveExit, spawnYaw);
  }

  forget(id: RoofTentId): void {
    this.ceiling.clearCeiling(id);
    this.occupants.forget(id);
  }

  occupantOf(id: RoofTentId): PlayerId | undefined {
    return this.occupants.occupantOf(id);
  }

  setOccupant(id: RoofTentId, playerId: PlayerId | undefined): void {
    this.occupants.setOccupant(id, playerId);
  }

  syncCeiling(id: RoofTentId): void {
    this.ceiling.syncCeiling(id);
  }

  ceilingOwner(
    dimensionId: DimensionId,
    cell: Cell,
    typeId: string,
  ): string | undefined {
    return this.ceiling.ceilingOwner(dimensionId, cell, typeId);
  }

  moveInside(playerId: PlayerId, id: RoofTentId): void {
    this.occupants.moveInside(playerId, id);
  }

  conceal(playerId: PlayerId): void {
    this.occupants.conceal(playerId);
  }

  reveal(playerId: PlayerId): void {
    this.occupants.reveal(playerId);
  }

  isSeated(playerId: PlayerId, id: RoofTentId): boolean | undefined {
    return this.occupants.isSeated(playerId, id);
  }

  placeOutside(playerId: PlayerId, id: RoofTentId): void {
    this.occupants.placeOutside(playerId, id);
  }

  spawnCellOf(id: RoofTentId): Vec3 {
    return this.spawn.spawnCellOf(id);
  }

  spawnSetBy(id: RoofTentId): PlayerId | undefined {
    return this.spawn.spawnSetBy(id);
  }

  setSpawnSetBy(id: RoofTentId, playerId: PlayerId | undefined): void {
    this.spawn.setSpawnSetBy(id, playerId);
  }

  dimensionOf(id: RoofTentId) {
    return this.spawn.dimensionOf(id);
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.occupants.showMessage(playerId, name);
  }

  eject(id: RoofTentId): void {
    new LeaveRoofTent(this).eject(id);
  }

  removed(id: RoofTentId, ownerId: PlayerId | undefined): void {
    this.eject(id);
    this.ceiling.clearCeiling(id);
    this.clearSpawn.removed(id, ownerId);
    this.forget(id);
  }
}
