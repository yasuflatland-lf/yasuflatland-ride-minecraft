// Use case: place a chair from its item on the top of a block outside the vehicles (ADR 0122).
import {
  type ChairKindId,
  canPlaceChair,
  chairCell,
  chairYaw,
} from "../../domain/camp/chair";
import { CHAIR_SPEC } from "../../domain/camp/spec";
import type { BlockFace } from "../../domain/shared/blockFace";
import { type Cell, cellCenter, cellOf } from "../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../domain/shared/ids";
import { isSpaceRefused, placeOnCells } from "../shared/groundPlacement";
import type { ChairWorld } from "./ports/chair";

export interface PlaceChairCommand {
  kind: ChairKindId;
  playerId?: PlayerId;
  dimensionId: DimensionId;
  /** The block the chair stands on (integer coordinates); the chair appears one block above it. */
  blockLocation: Cell;
  /** The placing player's yaw; the chair turns to face them. */
  yaw: number;
  /** Hotbar slot that held the item when it was used; the player may switch slots before the placement runs. */
  slot: number;
}

const above = (at: Cell, dy: number): Cell => cellOf({ ...at, y: at.y + dy });

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
    clicked: Cell,
    face: BlockFace,
  ): Cell | undefined {
    const cell = chairCell(clicked, face);
    if (cell === undefined || this.blockedAtSeat(dimensionId, cell))
      return undefined;
    return cell;
  }

  execute(cmd: PlaceChairCommand): boolean {
    const world = this.world;
    const { kind, dimensionId: dimension, blockLocation: block } = cmd;
    return placeOnCells(
      { dimension, cells: world, payment: world.paymentFor(kind) },
      {
        support: [],
        clear: [],
        refuses: CHAIR_SPEC.refuses,
        // Chairs check vehicle space at seat height only, before testing any air cells.
        extraCheck: () =>
          !this.blockedAtSeat(dimension, block) &&
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

  private blockedAtSeat(dimensionId: DimensionId, block: Cell): boolean {
    return (
      this.world.isOwnBlock(dimensionId, block) ||
      isSpaceRefused(
        this.world,
        dimensionId,
        above(block, 1),
        CHAIR_SPEC.refuses,
      )
    );
  }
}
