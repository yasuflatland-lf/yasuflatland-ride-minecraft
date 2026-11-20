import type { RoofTentId } from "../../../domain/camp/ids";
import type {
  RoofTentPlan,
  RoofTentRefusal,
} from "../../../domain/camp/roofTent/placement";
import type { Host } from "../../../domain/shared/hosted";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import type { Paint } from "../../../domain/shared/paint";
import type { Vec3 } from "../../../domain/shared/vec";
import type { HitsLeftFeedback } from "../../shared/ports/hitsLeft";

export interface RoofTentWorld extends HitsLeftFeedback {
  spawn(
    plan: RoofTentPlan,
    at: { dimensionId: DimensionId; location: Vec3; yaw: number },
    ownerId: PlayerId | undefined,
    paint: Paint,
  ): RoofTentId | undefined;
  /** Returns whether the removal already dispatched occupant cleanup. */
  remove(tentId: RoofTentId): boolean;
  ownerOf(tentId: RoofTentId): PlayerId | undefined;
  hostOf(tentId: RoofTentId): Host;
  /** Without an owner, drop the item at the tent before it is removed. */
  returnItem(tentId: RoofTentId, ownerId: PlayerId | undefined): void;
  groundFree(dimensionId: DimensionId, cell: Vec3): boolean;
  loaded(): readonly RoofTentId[];
  isCreative(playerId: PlayerId): boolean;
  consumeItem(playerId: PlayerId, slot: number): boolean;
  giveItem(playerId: PlayerId): void;
  showRefusal(playerId: PlayerId, reason: RoofTentRefusal): void;
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
