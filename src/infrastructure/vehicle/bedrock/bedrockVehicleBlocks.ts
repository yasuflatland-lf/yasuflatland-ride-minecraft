// Applies vehicle block changes through shared block managers (ADR 0012).
import type { Entity } from "@minecraft/server";
import type { VehicleBlockWorld } from "../../../application/vehicle/ports/drive";
import type { VehicleId } from "../../../domain/shared/ids";
import type { CutColumn } from "../../../domain/vehicle/cut";
import type { ClearCell } from "../../../domain/vehicle/dock/dock";
import type { DockCell } from "../../../domain/vehicle/dock/floor";
import type { LitCell } from "../../../domain/vehicle/lighting/headlights";
import type { Pave } from "../../../domain/vehicle/pave";
import { AIR_BLOCK } from "../../shared/identifiers";
import type { BladeCuts } from "./bladeCuts";
import type { DockLayer } from "./dockLayer";
import type { EntityIndex } from "./entityIndex";
import type { HeadlightBlocks } from "./headlightBlocks";
import type { RoadPaver } from "./roadPaver";

export class BedrockVehicleBlocks implements VehicleBlockWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly bladeCuts: BladeCuts,
    private readonly roadPaver: RoadPaver,
    private readonly dockBlocks: DockLayer,
    private readonly headlightBlocks: HeadlightBlocks,
  ) {}

  clearBlocks(vehicleId: VehicleId, cells: readonly ClearCell[]): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    for (const c of cells) {
      try {
        const b = vehicle.dimension.getBlock(c);
        // A block placed since the check belongs to a player.
        if (b?.typeId === c.typeId) b.setType(AIR_BLOCK);
      } catch {
        // Unloaded chunk: the dock then skips the cell, as it skips any non-air cell.
      }
    }
  }

  cutColumns(vehicleId: VehicleId, columns: readonly CutColumn[]): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) this.bladeCuts.cut(vehicle.dimension, columns);
  }

  pave(vehicleId: VehicleId, pave: Pave): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) this.roadPaver.pave(vehicle.dimension, pave);
  }

  layDock(vehicleId: VehicleId, cells: readonly DockCell[]): void {
    this.dockBlocks.lay(vehicleId, this.index.entity(vehicleId), cells);
  }

  shineHeadlights(vehicleId: VehicleId, cells: readonly LitCell[]): void {
    this.headlightBlocks.shine(vehicleId, this.index.entity(vehicleId), cells);
  }

  sweepCutDrop(entity: Entity): boolean {
    return this.bladeCuts.sweepDrop(entity);
  }
}
