import { BlockPermutation, type Entity } from "@minecraft/server";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type {
  DockBlockBase,
  DockCell,
} from "../../../domain/vehicle/dock/floor";

export interface DockLayer {
  doorOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined;
  cellOwner(dimensionId: DimensionId, cell: Vec3): VehicleId | undefined;
  laidBlockOwner(
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ): VehicleId | undefined;
  lay(
    vehicleId: VehicleId,
    vehicle: Entity | undefined,
    wanted: readonly DockCell[],
  ): void;
  clearGone(live: ReadonlySet<VehicleId>): void;
}

export interface DockBlockCodecPart<B extends DockBlockBase = DockBlockBase> {
  isBlock(fields: Record<string, unknown>): boolean;
  blockIdOf(block: B): string;
  permutationOf(block: B): BlockPermutation;
  upgrade?(saved: unknown): unknown;
}

export type DockBlockCodecs<Block extends DockBlockBase> = {
  readonly [B in Block as B["type"]]: DockBlockCodecPart<B>;
};

export function dockBlock<B extends DockBlockBase>(options: {
  id: string | ((block: B) => string);
  isBlock?: DockBlockCodecPart<B>["isBlock"];
  states?: (block: B) => Record<string, boolean | number | string>;
  upgrade?: DockBlockCodecPart<B>["upgrade"];
}): DockBlockCodecPart<B> {
  const { id, isBlock = () => true, states, upgrade } = options;
  const blockIdOf = typeof id === "string" ? () => id : id;
  return {
    isBlock,
    blockIdOf,
    permutationOf: (block) =>
      BlockPermutation.resolve(blockIdOf(block), states?.(block)),
    upgrade,
  };
}
