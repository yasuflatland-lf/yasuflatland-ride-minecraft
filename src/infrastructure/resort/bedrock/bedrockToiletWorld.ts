import { type Entity, world } from "@minecraft/server";
import type { ToiletWorld } from "../../../application/resort/ports/toiletWorld";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { FURNITURE_SPEC } from "../../../domain/resort/furniture";
import { asFurnitureId, type FurnitureId } from "../../../domain/resort/ids";
import { TOILET_SPEC } from "../../../domain/resort/shows";
import { cellOf } from "../../../domain/shared/cells";
import { searchExitCell } from "../../../domain/shared/exitSearch";
import { snapYaw4 } from "../../../domain/shared/facing";
import {
  asDimensionId,
  asPlayerId,
  type PlayerId,
} from "../../../domain/shared/ids";
import { forward } from "../../../domain/shared/vec";
import { allDimensions } from "../../shared/dimensions";
import { entityOfType } from "../../shared/entities";
import { NAMESPACE } from "../../shared/identifiers";
import { playerById } from "../../shared/players";
import { makeSafeStand, seatRider } from "../../shared/seating";
import {
  FURNITURE_IDS,
  TOILET_FLUSHING,
  TOILET_LID_OPEN,
} from "../identifiers";

export class BedrockToiletWorld implements ToiletWorld {
  constructor(
    private readonly deps: {
      isVehicleSpace: SpaceCheck;
      isCampSpace: SpaceCheck;
    },
  ) {}

  entity(id: FurnitureId): Entity | undefined {
    try {
      return entityOfType(world, id, FURNITURE_IDS.toilet.entity);
    } catch {
      return undefined;
    }
  }

  riderOf(id: FurnitureId): PlayerId | undefined {
    const rider = this.entity(id)
      ?.getComponent("minecraft:rideable")
      ?.getRiders()
      .find((entity) => entity.typeId === "minecraft:player");
    return rider ? asPlayerId(rider.id) : undefined;
  }

  loadedToilets(): readonly FurnitureId[] {
    return allDimensions().flatMap((dimension) =>
      dimension
        .getEntities({ type: FURNITURE_IDS.toilet.entity })
        .map((entity) => asFurnitureId(entity.id)),
    );
  }

  seat(id: FurnitureId, playerId: PlayerId): boolean {
    const toilet = this.entity(id);
    const player = playerById(playerId);
    if (!toilet || !player?.isValid || player.getComponent("minecraft:riding"))
      return false;
    try {
      const seat = FURNITURE_SPEC.toilet.seats[0];
      return seat !== undefined && seatRider(toilet, player, seat);
    } catch (error) {
      console.warn(`[${NAMESPACE}] toilet seating failed: ${error}`);
      return false;
    }
  }

  setLid(id: FurnitureId, open: boolean): void {
    this.entity(id)?.setProperty(TOILET_LID_OPEN, open);
  }

  setFlushing(id: FurnitureId, on: boolean): void {
    this.entity(id)?.setProperty(TOILET_FLUSHING, on);
  }

  placeBeside(id: FurnitureId, playerId: PlayerId): void {
    const toilet = this.entity(id);
    const player = playerById(playerId);
    // Do not pull a player out of a new ride or back after a dimension change.
    if (
      !toilet ||
      !player?.isValid ||
      player.dimension.id !== toilet.dimension.id ||
      player.getComponent("minecraft:riding")
    )
      return;
    const dimension = toilet.dimension;
    const dimensionId = asDimensionId(dimension.id);
    const isSafe = makeSafeStand({
      isVehicleSpace: (cell) => this.deps.isVehicleSpace(dimensionId, cell),
      isCampSpace: (cell) => this.deps.isCampSpace(dimensionId, cell),
    });
    const origin = cellOf(toilet.location);
    const facing = forward(snapYaw4(toilet.getRotation().y));
    const start = {
      x: origin.x + Math.round(facing.x * TOILET_SPEC.exitFrontOffset),
      y: origin.y,
      z: origin.z + Math.round(facing.z * TOILET_SPEC.exitFrontOffset),
    };
    const feet = searchExitCell(
      start,
      (cell) => cell.x === origin.x && cell.z === origin.z,
      {
        radius: TOILET_SPEC.exitSearchRadius,
        up: TOILET_SPEC.exitSearchUp,
        down: TOILET_SPEC.exitSearchDown,
      },
      (cell) => isSafe(dimension, cell),
    );
    if (feet)
      player.teleport(
        { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 },
        { dimension },
      );
  }

  showRefused(playerId: PlayerId, reason: "occupied" | "flushing"): void {
    const player = playerById(playerId);
    if (player?.isValid)
      player.onScreenDisplay.setActionBar({
        translate: `yasu_ride.toilet.${reason}`,
      });
  }
}
