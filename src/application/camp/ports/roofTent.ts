import type { Host } from "../../../domain/camp/hosted";
import type { RoofTentId } from "../../../domain/camp/ids";
import type { RoofTentPlan } from "../../../domain/camp/roofTent/placement";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";
import type { Vec3 } from "../../../domain/shared/vec";

export interface RoofTentWorld {
  spawn(
    plan: RoofTentPlan,
    at: { dimensionId: DimensionId; location: Vec3; yaw: number },
    ownerId: PlayerId | undefined,
    paint: Paint,
  ): RoofTentId | undefined;
  remove(tentId: RoofTentId): void;
  ownerOf(tentId: RoofTentId): PlayerId | undefined;
  hostOf(tentId: RoofTentId): Host;
  /** Without an owner, drop the item at the tent before it is removed. */
  returnItem(tentId: RoofTentId, ownerId: PlayerId | undefined): void;
  groundFree(dimensionId: DimensionId, cell: Vec3): boolean;
  loaded(): readonly RoofTentId[];
  isCreative(playerId: PlayerId): boolean;
  consumeItem(playerId: PlayerId, slot: number): boolean;
  giveItem(playerId: PlayerId): void;
  showMessage(playerId: PlayerId, name: string): void;
  paintOf(tentId: RoofTentId): Paint | undefined;
  paint(tentId: RoofTentId, paint: Paint): void;
  consumeDye(playerId: PlayerId, paint: Paint): void;
  playPaintSound(tentId: RoofTentId): void;
}

export interface OccupantEjector {
  eject(tentId: RoofTentId): void;
}

export interface RoofTentRemoved {
  removed(tentId: RoofTentId, ownerId: PlayerId | undefined): void;
}
