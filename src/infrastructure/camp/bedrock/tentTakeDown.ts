import { TENT_SPEC } from "../../../domain/camp/spec";
import {
  insideTent,
  PITCHED_STATE,
  type TentBlock,
  type TentId,
  tentCells,
  tentEntityLocation,
} from "../../../domain/camp/tent";
import { type Cell, cellKey, cellOf } from "../../../domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import { safeBlockAt } from "../../shared/blocks";
import { dimensionById } from "../../shared/dimensions";
import { giveBack, giveBackReceiver } from "../../shared/gearEntity";
import { AIR_BLOCK } from "../../shared/identifiers";
import type { CellLayer } from "../../shared/laidCells";
import { ejectTo } from "../../shared/seating";
import { isTentBlockTypeId, TENT_ITEM } from "../identifiers";
import type { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";
import { TENT_CELL_CODEC } from "./tentBlocks";
import { tentEntityOf } from "./tentEntity";
import type { TentFlapStore } from "./tentFlapStore";
import type { TentSpace } from "./tentSpace";

export class TentTakeDown {
  constructor(
    private readonly deps: {
      space: TentSpace;
      registry: DynamicPropertyTentRegistry;
      blocks: CellLayer<TentId, TentBlock>;
      flaps: TentFlapStore;
    },
  ) {}

  isOccupied(tentId: TentId): boolean {
    const entry = this.deps.space.entryOf(tentId);
    if (!entry) return false;
    return (
      dimensionById(entry.dimensionId)
        ?.getPlayers()
        .some((p) => insideTent(entry.pose, p.location)) === true
    );
  }

  returnTentItem(tentId: TentId, playerId: PlayerId | undefined): void {
    const receiver = giveBackReceiver(TENT_SPEC.giveBack, playerId);
    const target = receiver ?? tentEntityOf(tentId);
    if (target) {
      giveBack(target, TENT_ITEM, receiver);
      return;
    }
    // Legacy folding can recover a registered tent after its entity is gone.
    const entry = this.deps.space.entryOf(tentId);
    if (!entry) return;
    const dimension = dimensionById(entry.dimensionId);
    if (dimension)
      giveBack(
        { dimension, location: tentEntityLocation(entry.pose) },
        TENT_ITEM,
      );
  }

  unlayBlocks(tentId: TentId): void {
    // Cells the layer holds in unloaded chunks are left to the loop's clearGone.
    this.deps.blocks.lay(tentId, tentEntityOf(tentId), []);
  }

  clearBlocksByPose(tentId: TentId): void {
    const entry = this.deps.space.entryOf(tentId);
    if (!entry) return;
    const dimension = dimensionById(entry.dimensionId);
    // Still-unloaded cells are cleared from the entity's saved cells when it
    // loads as an orphan.
    // Open or closed, lit or not, a flap or lantern cell holds the same block
    // id, so the pitched state finds it.
    for (const c of tentCells(entry.pose, PITCHED_STATE)) {
      try {
        const b = safeBlockAt(dimension, c);
        // A replacement block belongs to the player, not the tent.
        if (b?.typeId === TENT_CELL_CODEC.blockIdOf(c.block))
          b.setType(AIR_BLOCK);
      } catch {
        // The chunk unloaded; the orphan removal clears this cell later.
      }
    }
  }

  clearTentBlocks(dimensionId: DimensionId, cells: readonly Cell[]): void {
    for (const cell of cells) this.clearTentBlock(dimensionId, cell);
  }

  private clearTentBlock(dimensionId: DimensionId, cell: Cell): void {
    const block = safeBlockAt(dimensionById(dimensionId), cell);
    if (isTentBlockTypeId(block?.typeId)) block?.setType(AIR_BLOCK);
  }

  removeTent(tentId: TentId): void {
    const tent = tentEntityOf(tentId);
    this.deps.registry.remove(tentId);
    this.deps.flaps.forget(tentId);
    tent?.remove();
  }

  ejectPlayers(
    dimensionId: DimensionId,
    cells: readonly Cell[],
    exit: Cell,
  ): void {
    const dimension = dimensionById(dimensionId);
    if (!dimension) return;
    const cellKeys = new Set(cells.map(cellKey));
    for (const player of dimension.getPlayers()) {
      const feet = player.location;
      if (!cellKeys.has(cellKey(cellOf(feet)))) continue;
      // Move sleepers off the mattresses before their blocks disappear.
      ejectTo(player, exit, dimension);
    }
  }
}
