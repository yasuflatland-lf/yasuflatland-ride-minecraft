// Use case: place a vehicle from its item on the cell its kind's placement rule
// (profile.placement) picks (ADR 0008, ADR 0050): the SUV and the camper on the top
// face of a block (ADR 0067), the sports boat at the water surface from any face or
// the view ray first, then on land from a top face (ADR 0051). This use case picks
// the cell (cellFor) and checks profile.placement.clearance.
import type { Vec3 } from "../../domain/shared/vec";
import type { VehicleKind } from "../../domain/vehicle/kind";
import { createVehicle, profileOf } from "../../domain/vehicle/kinds/index";
import {
  type BlockFace,
  canPlaceAt,
  placementCell,
} from "../../domain/vehicle/placement";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { PlacementWorld } from "./ports";

export interface PlaceVehicleCommand {
  kind: VehicleKind;
  playerId: string;
  dimensionId: string;
  /**
   * Cell the vehicle sits on top of (integer coordinates): the block the item was
   * used on, or for a water kind the top water cell above or beside it (ADR 0051).
   * The vehicle appears one block above it.
   */
  blockLocation: Vec3;
  yaw: number;
  /** Hotbar slot that held the item when it was used; the player may switch slots before the placement runs. */
  slot: number;
}

export class PlaceVehicle {
  constructor(
    private readonly world: PlacementWorld,
    private readonly repo: VehicleRepository,
  ) {}

  /**
   * The cell a vehicle of this kind is placed on top of when its item is used
   * on `face` of the block at `clicked`, or undefined when no surface of its
   * placement rule matches (ADR 0050, ADR 0051). Read-only, so a before-event
   * handler may call it.
   */
  cellFor(
    kind: VehicleKind,
    dimensionId: string,
    clicked: Vec3,
    face: BlockFace,
  ): Vec3 | undefined {
    return placementCell(profileOf(kind).placement, clicked, face, (at) =>
      this.world.isWaterAt(dimensionId, at),
    );
  }

  /** Whether this kind can be placed on water, so a view ray over open water may place it (ADR 0051). */
  placesOnWater(kind: VehicleKind): boolean {
    return profileOf(kind).placement.surfaces.includes("water");
  }

  execute(cmd: PlaceVehicleCommand): boolean {
    const block = cmd.blockLocation;
    const isAir = (dx: number, dy: number, dz: number) =>
      this.world.isAir(cmd.dimensionId, {
        x: block.x + dx,
        y: block.y + dy,
        z: block.z + dz,
      });
    // Returning before the spawn also leaves the item unconsumed.
    if (!canPlaceAt(isAir, profileOf(cmd.kind).placement.clearance))
      return false;
    // Taking the item first means a player who moved or dropped it in the
    // meantime gets no vehicle, instead of a vehicle and the item (ADR 0024).
    if (
      !this.world.isCreative(cmd.playerId) &&
      !this.world.consumeVehicleItem(cmd.playerId, cmd.slot, cmd.kind)
    )
      return false;
    const id = this.world.spawnVehicle(
      cmd.dimensionId,
      { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 },
      cmd.yaw,
      cmd.kind,
      cmd.playerId,
    );
    this.repo.save(createVehicle(cmd.kind, id, cmd.yaw));
    return true;
  }
}
