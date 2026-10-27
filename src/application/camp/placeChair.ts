// Use case: place a chair from its item on the top of a block outside the vehicles (ADR 0122).
import {
  type ChairFace,
  type ChairKindId,
  canPlaceChair,
  chairCell,
  chairYaw,
} from "../../domain/camp/chair";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { ChairWorld } from "./ports/chair";

export interface PlaceChairCommand {
  kind: ChairKindId;
  playerId: PlayerId;
  dimensionId: DimensionId;
  /** The block the chair stands on (integer coordinates); the chair appears one block above it. */
  blockLocation: Vec3;
  /** The placing player's yaw; the chair turns to face them. */
  yaw: number;
  /** Hotbar slot that held the item when it was used; the player may switch slots before the placement runs. */
  slot: number;
}

const above = (at: Vec3, dy: number): Vec3 => ({
  x: at.x,
  y: at.y + dy,
  z: at.z,
});

export class PlaceChair {
  constructor(private readonly world: ChairWorld) {}

  /**
   * The block a chair stands on when its item is used on `face` of the block at
   * `clicked`, or undefined when it cannot go there because of the face, a
   * vehicle, or one of this add-on's blocks. Read-only, so a before-event handler
   * may call it, and a refusal leaves the click to the block.
   */
  cellFor(
    dimensionId: DimensionId,
    clicked: Vec3,
    face: ChairFace,
  ): Vec3 | undefined {
    const cell = chairCell(clicked, face);
    if (cell === undefined || this.blockedByVehicle(dimensionId, cell))
      return undefined;
    return cell;
  }

  execute(cmd: PlaceChairCommand): boolean {
    const block = cmd.blockLocation;
    // Each return before the spawn also leaves the item unconsumed.
    if (this.blockedByVehicle(cmd.dimensionId, block)) return false;
    if (
      !canPlaceChair((dy) =>
        this.world.isAir(cmd.dimensionId, above(block, dy)),
      )
    )
      return false;
    if (this.world.hasChairAt(cmd.kind, cmd.dimensionId, above(block, 1)))
      return false;
    // Taking the item first means a player who moved or dropped it in the
    // meantime gets no chair, instead of a chair and the item (ADR 0024).
    if (
      !this.world.isCreative(cmd.playerId) &&
      !this.world.consumeChairItem(cmd.kind, cmd.playerId, cmd.slot)
    )
      return false;
    this.world.spawnChair(
      cmd.kind,
      cmd.dimensionId,
      { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 },
      chairYaw(cmd.yaw),
    );
    return true;
  }

  private blockedByVehicle(dimensionId: DimensionId, block: Vec3): boolean {
    return (
      this.world.isOwnBlock(dimensionId, block) ||
      this.world.isVehicleSpace(dimensionId, above(block, 1))
    );
  }
}
