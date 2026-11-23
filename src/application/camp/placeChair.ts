// Use case: place a chair from its item on the top of a block outside the vehicles (ADR 0122).
import {
  type ChairFace,
  type ChairKindId,
  canPlaceChair,
  chairCell,
  chairYaw,
} from "../../domain/camp/chair";
import { cellCenter } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { placeOnCells } from "../shared/groundPlacement";
import type { ItemPayment } from "../shared/ports/itemPayment";
import type { ChairWorld } from "./ports/chair";

export interface PlaceChairCommand {
  kind: ChairKindId;
  playerId?: PlayerId;
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
    const world = this.world;
    const { kind, dimensionId: dimension, blockLocation: block } = cmd;
    const payment: ItemPayment = {
      isCreative: (p) => world.isCreative(p),
      consumeItem: (p, s) => world.consumeChairItem(kind, p, s),
      refund: (p) => world.refundChairItem(kind, p),
    };
    return placeOnCells(
      { dimension, cells: world, payment },
      {
        support: [],
        clear: [],
        protect: ["vehicle"],
        // Chairs check vehicle space at seat height only, before testing any air cells.
        extraCheck: () =>
          !this.blockedByVehicle(dimension, block) &&
          canPlaceChair((dy) => world.isAir(dimension, above(block, dy))) &&
          !world.hasChairAt(kind, dimension, above(block, 1)),
      },
      { player: cmd.playerId, slot: cmd.slot },
      () =>
        world.spawnChair(
          kind,
          dimension,
          cellCenter(block, 1),
          chairYaw(cmd.yaw),
        ),
    ).placed;
  }

  private blockedByVehicle(dimensionId: DimensionId, block: Vec3): boolean {
    return (
      this.world.isOwnBlock(dimensionId, block) ||
      this.world.isVehicleSpace(dimensionId, above(block, 1))
    );
  }
}
