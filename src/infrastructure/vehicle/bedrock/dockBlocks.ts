import type { Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { cellKey, cellOf, parseCell } from "../../../domain/shared/cells";
import {
  asDimensionId,
  type DimensionId,
  type VehicleId,
} from "../../../domain/shared/ids";
import { ticks } from "../../../domain/shared/ticks";
import type { Vec3 } from "../../../domain/shared/vec";
import {
  type DockBlock,
  type DockCell,
  sameBlock,
} from "../../../domain/vehicle/dock/floor";
import { type CellCodec, CellLayer } from "../../shared/laidCells";
import { LIGHT_BLOCK } from "../../shared/lightBlocks";
import {
  type DockBlockCodecPart,
  type DockBlockCodecs,
  type DockLayer,
  dockBlock,
} from "./dockLayer";
import {
  DECK_CELLS_PROPERTY,
  DECK_FLOOR_BLOCK,
  DECK_FLOOR_HEIGHT_STATE,
} from "./identifiers";

// The block defines one collision permutation per pixel height (ADR 0063).
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 16;
// Reading a laid cell costs one getBlock call, and a parked camper lays about 107
// to 121 cells, so the cells are read once a second per vehicle, not every tick (ADR 0096).
export const DOCK_RECHECK_TICKS = ticks(20);

function isHeight(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_HEIGHT &&
    v <= MAX_HEIGHT
  );
}

// Boats saved height-only cells before typed docks; restore them as decks
// so a reload or restart can still clear their blocks (ADR 0063).
function upgradeHeightOnlyCell(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    !("block" in value) &&
    "height" in value &&
    isHeight(value.height)
  ) {
    const { height, ...cell } = value;
    return { ...cell, block: { type: "deck", height } };
  }
  return value;
}

export const DECK_CODEC = {
  deck: dockBlock({
    id: DECK_FLOOR_BLOCK,
    isBlock: (b) => isHeight(b.height),
    states: (b) => ({ [DECK_FLOOR_HEIGHT_STATE]: b.height }),
    upgrade: upgradeHeightOnlyCell,
  }),
} satisfies Pick<DockBlockCodecs, "deck">;

export const LIGHT_CODEC = {
  light: dockBlock({ id: LIGHT_BLOCK }),
} satisfies Pick<DockBlockCodecs, "light">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function composeDockCodec(parts: DockBlockCodecs): CellCodec<DockBlock> {
  const partOf = (block: DockBlock): DockBlockCodecPart => parts[block.type];
  const upgrades = Object.values(parts).flatMap((part) =>
    part.upgrade ? [part.upgrade] : [],
  );
  return {
    property: DECK_CELLS_PROPERTY,
    upgrade: (saved) =>
      upgrades.reduce((value, upgrade) => upgrade(value), saved),
    isCell(value): value is DockCell {
      if (!isRecord(value) || parseCell(value) === undefined) return false;
      const block = value.block;
      if (
        !isRecord(block) ||
        typeof block.type !== "string" ||
        !Object.hasOwn(parts, block.type)
      )
        return false;
      return parts[block.type as DockBlock["type"]].isBlock(block);
    },
    same: sameBlock,
    blockIdOf: (block) => partOf(block).blockIdOf(block),
    permutationOf: (block) => partOf(block).permutationOf(block),
  };
}

export class DockBlocks implements DockLayer {
  private readonly layer: CellLayer<VehicleId, DockBlock>;

  constructor(
    private readonly campSpace: SpaceCheck,
    codec: CellCodec<DockBlock>,
  ) {
    this.layer = new CellLayer(codec, DOCK_RECHECK_TICKS);
  }

  /** The vehicle whose laid door is at this cell, if any. */
  doorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.layer.ownerOf(
      dimensionId,
      cellOf(cell),
      (block) => block.type === "door",
    );
  }

  /** The vehicle that laid any dock block at this cell, if any (ADR 0093). */
  cellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined {
    return this.layer.ownerOf(dimensionId, cellOf(cell));
  }

  /** The vehicle that laid this cell, while the world still holds the block it laid there (ADR 0096). */
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined {
    return this.layer.laidBlockOwner(dimensionId, cellOf(cell), typeId);
  }

  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly DockCell[],
  ): void {
    const cells = vehicle
      ? this.outsideCamp(vehicleId, vehicle, wanted)
      : wanted;
    this.layer.lay(vehicleId, vehicle, cells);
  }

  /**
   * A camp cell belongs to the other feature; a light there is its spawn guard,
   * not air. Cells this vehicle already holds, saved ones included, stay laid
   * (ADR 0115, 0129). Camp is asked first because it is a map lookup; the held
   * cells are read only once camp claims a wanted cell.
   */
  private outsideCamp(
    vehicleId: VehicleId,
    vehicle: Entity,
    wanted: readonly DockCell[],
  ): DockCell[] {
    const dimensionId = asDimensionId(vehicle.dimension.id);
    let held: ReadonlySet<string> | undefined;
    return wanted.filter((c) => {
      if (!this.campSpace(dimensionId, c)) return true;
      held ??= this.layer.heldKeys(vehicleId, vehicle);
      return held.has(cellKey(c));
    });
  }

  clearGone(live: ReadonlySet<VehicleId>): void {
    this.layer.clearGone(live);
  }
}
