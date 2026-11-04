// Maintains vehicle seats, stand-ins and rider placement (ADR 0012).

import type { RiderWorld } from "../../../application/vehicle/ports/drive";
import {
  asPlayerId,
  type PlayerId,
  type VehicleId,
} from "../../../domain/shared/ids";
import { distanceSq, type Vec3 } from "../../../domain/shared/vec";
import {
  type DeckSeatSpot,
  type Departure,
  inBox,
} from "../../../domain/vehicle/dock/dock";
import type { SeatAssignment } from "../../../domain/vehicle/seatChoice";
import type { StandInPose } from "../../../domain/vehicle/standIn";
import { messageKey } from "../../shared/identifiers";
import type { DeckSeats } from "./deckSeats";
import type { EntityIndex } from "./entityIndex";
import { seatExitSpot } from "./seatExitSpot";
import type { SeatFillers } from "./seatFillers";
import type { StandIns } from "./standIns";
import { standUp } from "./standUp";

export class BedrockVehicleRiders implements RiderWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly deckSeats: DeckSeats,
    private readonly seatFillers: SeatFillers,
    private readonly standIns: StandIns,
  ) {}

  standRiderAt(vehicleId: VehicleId, playerId: PlayerId, at: Vec3): void {
    const vehicle = this.index.entity(vehicleId);
    const player = this.index.player(playerId);
    if (!vehicle || !player) return;
    standUp(player, vehicle, at, seatExitSpot);
  }

  keepDeckSeats(
    vehicleId: VehicleId,
    positions: readonly (DeckSeatSpot | undefined)[],
    yaw: number,
  ): void {
    this.deckSeats.keep(
      vehicleId,
      this.index.entity(vehicleId),
      positions,
      yaw,
    );
  }

  boardDeckRiders(vehicleId: VehicleId): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) this.deckSeats.board(vehicle);
  }

  keepSeatLayout(vehicleId: VehicleId, layout: SeatAssignment): void {
    this.seatFillers.lay(
      vehicleId,
      this.index.entity(vehicleId),
      layout,
      (playerId) => this.index.player(playerId),
    );
  }

  keepStandIn(vehicleId: VehicleId, pose: StandInPose | undefined): void {
    this.standIns.keep(vehicleId, this.index.entity(vehicleId), pose);
  }

  seatStandingPlayers(vehicleId: VehicleId, departure: Departure): void {
    const vehicle = this.index.entity(vehicleId);
    const rideable = vehicle?.getComponent("minecraft:rideable");
    if (!vehicle || !rideable) return;
    // Boarding already ran this tick, so a player still on a deck seat was refused
    // a seat; the deck seats go next, so they leave like a standing player (ADR 0095).
    const refused = this.deckSeats.eject(vehicle);
    // A rider the seat layout took off this tick is seated again next tick; the
    // engine refuses addRider in the tick of the ejection and the exit would
    // throw them out of the camper (ADR 0154).
    const refusedIds = new Set(refused.map((p) => p.id));
    const reseated = this.seatFillers.waitingRiders(vehicleId);
    const standing = vehicle.dimension
      .getPlayers()
      .filter(
        (p) =>
          !refusedIds.has(p.id) &&
          !reseated.has(asPlayerId(p.id)) &&
          !p.getComponent("minecraft:riding") &&
          departure.boxes.some((box) => inBox(box, p.location)),
      )
      .sort(
        (a, b) =>
          distanceSq(a.location, vehicle.location) -
          distanceSq(b.location, vehicle.location),
      );
    for (const p of [...refused, ...standing])
      if (!rideable.addRider(p) && departure.exit)
        p.teleport(departure.exit, {
          rotation: { x: 0, y: departure.exit.yaw },
        });
  }

  showMessage(playerId: PlayerId, name: string): void {
    this.index.player(playerId)?.onScreenDisplay.setActionBar({
      translate: messageKey(name),
    });
  }
}
