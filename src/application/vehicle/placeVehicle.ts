import type { DimensionId, PlayerId } from "../../domain/shared/ids";
// Use case: place a vehicle from its item on the cell its kind's placement rule
// (profile.placement) picks (ADR 0008, ADR 0050): the SUV and the camper on the top
// face of a block (ADR 0067), the sports boat at a liquid surface from any face or
// the view ray first, then on land from a top face (ADR 0051). This use case picks
// the cell (cellFor) and checks profile.placement.clearance.
import type { Vec3 } from "../../domain/shared/vec";
import type { VehicleKind } from "../../domain/vehicle/kind";
import { createVehicle, profileOf } from "../../domain/vehicle/kinds/index";
import type { PlacementGift } from "../../domain/vehicle/placement/gift";
import {
  type BlockFace,
  canPlaceAt,
  placementCell,
} from "../../domain/vehicle/placement/placement";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { PlacementWorld } from "./ports/placement";

export interface PlaceVehicleCommand {
  kind: VehicleKind;
  playerId: PlayerId;
  dimensionId: DimensionId;
  /**
   * Cell the vehicle sits on top of (integer coordinates): the block the item was
   * used on, or for a liquid kind the top liquid cell above or beside it (ADR 0051, 0149).
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
    dimensionId: DimensionId,
    clicked: Vec3,
    face: BlockFace,
  ): Vec3 | undefined {
    return placementCell(
      profileOf(kind).placement,
      clicked,
      face,
      (at, liquid) =>
        liquid === "water"
          ? this.world.isWaterAt(dimensionId, at)
          : this.world.isLavaAt(dimensionId, at),
    );
  }

  /** Whether a view ray over an open liquid may place this kind (ADR 0051, 0149). */
  placesOnLiquid(kind: VehicleKind): boolean {
    return profileOf(kind).placement.surfaces.some(
      (surface) => surface === "water" || surface === "lava",
    );
  }

  execute(cmd: PlaceVehicleCommand): boolean {
    const block = cmd.blockLocation;
    const isFree = (dx: number, dy: number, dz: number) => {
      const at = { x: block.x + dx, y: block.y + dy, z: block.z + dz };
      if (this.world.isCampSpace(cmd.dimensionId, at)) return false;
      return this.world.isAir(cmd.dimensionId, at);
    };
    // Returning before the spawn also leaves the item unconsumed.
    if (!canPlaceAt(isFree, profileOf(cmd.kind).placement.clearance))
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
    this.giveGift(cmd.playerId, profileOf(cmd.kind).placementGift);
    return true;
  }

  // Marking only after giving means a give that throws is retried with the
  // player's next vehicle of the kind instead of leaving them without it (ADR 0093).
  private giveGift(playerId: PlayerId, gift: PlacementGift | undefined): void {
    if (gift === undefined || this.world.receivedGift(playerId, gift) !== false)
      return;
    this.world.giveGift(playerId, gift);
    this.world.markGiftReceived(playerId, gift);
  }
}
