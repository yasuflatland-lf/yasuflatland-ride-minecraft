import type { Host } from "../../../domain/camp/hosted";
import type { RoofTentPlan } from "../../../domain/camp/roofTent/placement";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";
import type { Vec3 } from "../../../domain/shared/vec";

export interface RoofTentWorld {
  spawn(
    plan: RoofTentPlan,
    at: { dimensionId: DimensionId; location: Vec3; yaw: number },
    ownerId: string | undefined,
    paint: Paint,
  ): string | undefined;
  remove(tentId: string): void;
  ownerOf(tentId: string): string | undefined;
  hostOf(tentId: string): Host;
  /** Without an owner, drop the item at the tent before it is removed. */
  returnItem(tentId: string, ownerId: string | undefined): void;
  groundFree(dimensionId: DimensionId, cell: Vec3): boolean;
  loaded(): readonly string[];
  isCreative(playerId: PlayerId): boolean;
  consumeItem(playerId: PlayerId, slot: number): boolean;
  giveItem(playerId: PlayerId): void;
  showMessage(playerId: PlayerId, name: string): void;
  paintOf(tentId: string): Paint | undefined;
  paint(tentId: string, paint: Paint): void;
  consumeDye(playerId: PlayerId, paint: Paint): void;
}

export interface OccupantEjector {
  eject(tentId: string): void;
}

export interface RoofTentRemoved {
  removed(tentId: string, ownerId: string | undefined): void;
}
