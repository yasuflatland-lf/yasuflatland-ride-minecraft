import type { Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { asDimensionId, type VehicleId } from "../../../domain/shared/ids";
import type { LightLevel } from "../../../domain/shared/laidCells";
import { ticks } from "../../../domain/shared/ticks";
import {
  FULL_LIGHT_LEVEL,
  type LitCell,
} from "../../../domain/vehicle/lighting/headlights";
import { type CellCodec, CellLayer } from "../../shared/laidCells";
import { lightCellCodec } from "../../shared/lightCells";
import { LIT_CELLS_PROPERTY } from "./identifiers";

function upgradeLitCell(saved: unknown): unknown {
  if (typeof saved !== "object" || saved === null || "block" in saved)
    return saved;
  const { x, y, z, level } = saved as Record<string, unknown>;
  if (level !== undefined && typeof level !== "number") return saved;
  return { x, y, z, block: { level: level ?? FULL_LIGHT_LEVEL } };
}

/** Reads legacy flat headlight cells and the current laid-cell format (ADR 0020). */
export const HEADLIGHT_CELL_CODEC: CellCodec<LightLevel> = lightCellCodec(
  LIT_CELLS_PROPERTY,
  upgradeLitCell,
);

// Each laid cell costs one getBlock to recheck, so read them once a second per
// vehicle and keep unchanged beams off the per-tick block-read path (ADR 0096).
export const HEADLIGHT_RECHECK_TICKS = ticks(20);

export class HeadlightBlocks {
  private readonly layer = new CellLayer<VehicleId, LightLevel>(
    HEADLIGHT_CELL_CODEC,
    HEADLIGHT_RECHECK_TICKS,
  );

  constructor(private readonly campSpace: SpaceCheck) {}

  /** `vehicle` is undefined when the entity is gone; its cells are then only cleared. */
  shine(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly LitCell[],
  ): void {
    const dimensionId = vehicle && asDimensionId(vehicle.dimension.id);
    const laid = dimensionId
      ? wanted
          .filter((cell) => !this.campSpace(dimensionId, cell))
          .map(({ level, ...cell }) => ({ ...cell, block: { level } }))
      : [];
    this.layer.lay(vehicleId, vehicle, laid);
  }

  clearGone(live: ReadonlySet<VehicleId>): void {
    this.layer.clearGone(live);
  }
}
