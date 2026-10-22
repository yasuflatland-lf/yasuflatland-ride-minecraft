import type { PlayerId } from "../shared/ids";
import type { Vec2 } from "../shared/vec";
import type { VehicleProfile } from "./profile";
import { ChosenSeats, type SeatAim, type SeatAssignment } from "./seatChoice";
import { Seating } from "./seating";
import type { RiderPos } from "./seats";
import { SPEC } from "./spec";

/** A kind whose players choose their seat keeps each rider's list index equal to their seat (ADR 0120). */
function seatReadingOf(profile: VehicleProfile): "position" | "slot" {
  return profile.boarding.order === "chosen" ? "slot" : "position";
}

export class Crew {
  private seating: Seating;
  private readonly chosenSeats: ChosenSeats | undefined;
  private driverlessTicks = Number.POSITIVE_INFINITY;

  constructor(private readonly profile: VehicleProfile) {
    this.seating = new Seating(profile.seats.positions, seatReadingOf(profile));
    this.chosenSeats =
      profile.boarding.order === "chosen"
        ? new ChosenSeats({
            positions: profile.seats.positions,
            height: profile.boarding.aimHeight,
            radius: profile.boarding.aimRadius,
          })
        : undefined;
  }

  static restore(
    profile: VehicleProfile,
    riders: readonly RiderPos[],
    f: Vec2,
  ): Crew {
    const crew = new Crew(profile);
    crew.seating = Seating.restore(
      profile.seats.positions,
      riders,
      f,
      seatReadingOf(profile),
    );
    return crew;
  }

  update<R extends RiderPos>(riders: readonly R[], f: Vec2, step: Vec2) {
    const seated = this.seating.update(riders, f, step);
    this.driverlessTicks = seated.driver ? 0 : this.driverlessTicks + 1;
    const awaitingDriver =
      seated.driver === undefined &&
      riders.length > 0 &&
      this.driverlessTicks <= SPEC.driverHandoverTicks;
    return { ...seated, awaitingDriver };
  }

  request(id: PlayerId, aim: SeatAim): boolean {
    if (!this.chosenSeats) return false;
    this.chosenSeats.request(id, aim);
    return true;
  }

  /**
   * The rider list for a kind whose players choose their seat. The seat of an occupied
   * deck seat is held for its rider, since a player seated there would take the deck seat
   * away under them (ADR 0063). Deck-seat riders who board this tick ask for that seat.
   */
  layout(
    riders: readonly RiderPos[],
    deckSeatRiders: readonly (PlayerId | undefined)[],
    departing: boolean,
  ): SeatAssignment | undefined {
    const boarding = this.profile.boarding;
    if (!this.chosenSeats || boarding.order !== "chosen") return undefined;
    const positions = this.profile.seats.positions;
    const held = deckSeatRiders.slice(0, positions.length);
    if (departing)
      for (const [seat, id] of held.entries()) {
        const at = positions[seat];
        if (id !== undefined && at)
          this.chosenSeats.request(id, {
            eye: { x: at.x, y: boarding.aimHeight, z: at.z },
          });
      }
    return this.chosenSeats.settle(riders, held);
  }

  get driver(): PlayerId | undefined {
    return this.seating.driver;
  }
  get occupied(): boolean {
    return this.seating.occupied;
  }
  taken(): ReadonlySet<number> {
    return this.seating.taken();
  }
}
