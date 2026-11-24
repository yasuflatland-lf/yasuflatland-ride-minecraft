import type { Entity } from "@minecraft/server";
import type { BeachChairFormWorld } from "../../../application/resort/ports/beachChairForm";
import type { BeachChairRiderWorld } from "../../../application/resort/ports/beachChairRider";
import type {
  BeachChairTakeBackWorld,
  BeachChairWorld,
} from "../../../application/resort/ports/beachChairWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import {
  type BeachChairPose,
  beachChairOrigin,
  beachChairPoseAt,
  type ChairForm,
  type ChairState,
} from "../../../domain/resort/beachChair";
import { beachChairExit } from "../../../domain/resort/beachChairExit";
import { asBeachChairId, type BeachChairId } from "../../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../domain/resort/spec";
import { snapYaw4 } from "../../../domain/shared/facing";
import type { DimensionId, PlayerId } from "../../../domain/shared/ids";
import {
  gearEntities,
  gearFeedback,
  gearGroundChecks,
  giveBack,
  giveBackReceiver,
  spawnIn,
} from "../../shared/gearEntity";
import { BedrockPaidGroundCells } from "../../shared/groundCells";
import { NAMESPACE } from "../../shared/identifiers";
import { playerById } from "../../shared/players";
import { playerRiderOf, seatPlayer, standBeside } from "../../shared/seating";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import {
  BEACH_CHAIR,
  BEACH_CHAIR_FOLD_EVENT,
  BEACH_CHAIR_FOLDED,
  BEACH_CHAIR_ITEM,
  BEACH_CHAIR_LOUNGE_ANIMATION,
  BEACH_CHAIR_LOUNGE_CONTROLLER,
  BEACH_CHAIR_UNFOLD_EVENT,
} from "../identifiers";
import { resortGearCells } from "./resortGearCells";

const entities = gearEntities<BeachChairId>(BEACH_CHAIR);
const feedback = gearFeedback("beach_chair");

export class BedrockBeachChairWorld
  extends BedrockPaidGroundCells
  implements
    BeachChairWorld,
    BeachChairTakeBackWorld,
    BeachChairFormWorld,
    BeachChairRiderWorld
{
  entity = entities.entity;
  remove = entities.remove;
  showBlocked = feedback.showBlocked;
  showHitsLeft = feedback.showHitsLeft;
  showTaken = feedback.showTaken;
  readonly isSolidTop: SpaceCheck;
  readonly isCampSpace: SpaceCheck;

  constructor(
    private readonly deps: {
      topHosts: TopHostRegistry;
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {
    super(
      (dimension, cell) => deps.isVehicleSpace(dimension, cell),
      BEACH_CHAIR_ITEM,
    );
    ({ isSolidTop: this.isSolidTop, isCampSpace: this.isCampSpace } =
      gearGroundChecks(deps));
  }
  state(id: BeachChairId): ChairState | undefined {
    const entity = this.entity(id);
    if (!entity) return undefined;
    return {
      form: entity.getProperty(BEACH_CHAIR_FOLDED) === true ? "table" : "chair",
      occupied: this.riderOf(id) !== undefined,
      somethingOnTop:
        this.deps.topHosts.itemsOnTop("beach_chair", id).length > 0,
    };
  }
  showRefused(
    player: PlayerId,
    reason: "occupied" | "somethingOnTop" | "wrongForm",
  ): void {
    feedback.showRefused(
      player,
      reason === "occupied"
        ? "occupied"
        : reason === "wrongForm"
          ? "folded"
          : "something_on_top",
      [],
    );
  }
  riderOf(id: BeachChairId): PlayerId | undefined {
    return playerRiderOf(this.entity(id));
  }
  seat(id: BeachChairId, playerId: PlayerId): boolean {
    return seatPlayer(
      this.entity(id),
      playerId,
      BEACH_CHAIR_SPEC.seatOffset,
      "beach chair",
    );
  }
  playLounge(playerId: PlayerId): void {
    try {
      playerById(playerId)?.playAnimation(BEACH_CHAIR_LOUNGE_ANIMATION, {
        stopExpression: "!query.is_riding",
        controller: BEACH_CHAIR_LOUNGE_CONTROLLER,
      });
    } catch (error) {
      console.warn(`[${NAMESPACE}] beach chair pose failed: ${error}`);
    }
  }
  placeBeside(id: BeachChairId, playerId: PlayerId): void {
    const chair = this.entity(id);
    if (chair)
      standBeside(
        playerId,
        chair,
        (isSafe) =>
          beachChairExit(
            beachChairPoseAt(chair.location, snapYaw4(chair.getRotation().y)),
            isSafe,
          ),
        this.deps,
      );
  }
  resortGearCells = resortGearCells;
  spawn(
    dimension: DimensionId,
    pose: BeachChairPose,
  ): BeachChairId | undefined {
    const entity = spawnIn(
      dimension,
      BEACH_CHAIR,
      beachChairOrigin(pose),
      pose.yaw,
    );
    return entity && asBeachChairId(entity.id);
  }
  setForm(id: BeachChairId, form: ChairForm): void {
    const entity = this.entity(id);
    if (!entity) return;
    entity.setProperty(BEACH_CHAIR_FOLDED, form === "table");
    if (form === "table") {
      entity.triggerEvent(BEACH_CHAIR_FOLD_EVENT);
      this.hold(entity);
    } else {
      entity.triggerEvent(BEACH_CHAIR_UNFOLD_EVENT);
    }
  }
  /**
   * Without gravity or collision the table keeps the downward velocity it had
   * resting on the floor and sinks through it, so it is pinned to its
   * placement pose origin, as the docked boat is (ADR 0063).
   */
  private hold(entity: Entity): void {
    try {
      const pose = beachChairPoseAt(
        entity.location,
        snapYaw4(entity.getRotation().y),
      );
      entity.clearVelocity();
      entity.teleport(beachChairOrigin(pose));
    } catch {
      // The entity can unload between lookup and holding its pose.
    }
  }
  dropItem(id: BeachChairId, player: PlayerId | undefined): void {
    const entity = this.entity(id);
    if (!entity) return;
    const receiver = giveBackReceiver(BEACH_CHAIR_SPEC.giveBack, player);
    giveBack(entity, BEACH_CHAIR_ITEM, receiver);
  }
}
