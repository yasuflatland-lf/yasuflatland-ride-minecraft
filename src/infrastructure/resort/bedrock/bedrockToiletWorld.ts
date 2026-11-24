import type { ToiletWorld } from "../../../application/resort/ports/toiletWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { FURNITURE_SPEC } from "../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../domain/resort/ids";
import { toiletExit } from "../../../domain/resort/toiletExit";
import { cellOf } from "../../../domain/shared/cells";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { PlayerId } from "../../../domain/shared/ids";
import { allDimensions } from "../../shared/dimensions";
import { gearEntities, gearFeedback } from "../../shared/gearEntity";
import { playerRiderOf, seatPlayer, standBeside } from "../../shared/seating";
import {
  FURNITURE_IDS,
  TOILET_FLUSHING,
  TOILET_LID_OPEN,
} from "../identifiers";

const entities = gearEntities<FurnitureId>(FURNITURE_IDS.toilet.entity);
const feedback = gearFeedback("toilet");

export class BedrockToiletWorld implements ToiletWorld {
  entity = entities.entity;

  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {}

  riderOf(id: FurnitureId): PlayerId | undefined {
    return playerRiderOf(this.entity(id));
  }

  loadedToilets(): readonly FurnitureId[] {
    return allDimensions().flatMap((dimension) =>
      dimension
        .getEntities({ type: FURNITURE_IDS.toilet.entity })
        .map((entity) => asFurnitureId(entity.id)),
    );
  }

  seat(id: FurnitureId, playerId: PlayerId): boolean {
    return seatPlayer(
      this.entity(id),
      playerId,
      FURNITURE_SPEC.toilet.seats[0],
      "toilet",
    );
  }

  setLid(id: FurnitureId, open: boolean): void {
    this.entity(id)?.setProperty(TOILET_LID_OPEN, open);
  }

  setFlushing(id: FurnitureId, on: boolean): void {
    this.entity(id)?.setProperty(TOILET_FLUSHING, on);
  }

  placeBeside(id: FurnitureId, playerId: PlayerId): void {
    const toilet = this.entity(id);
    if (toilet)
      standBeside(
        playerId,
        toilet,
        (isSafe) =>
          toiletExit(
            cellOf(toilet.location),
            snapYaw4(toilet.getRotation().y),
            isSafe,
          ),
        this.deps,
      );
  }

  showRefused(playerId: PlayerId, reason: "occupied" | "flushing"): void {
    feedback.showRefused(playerId, reason);
  }
}
