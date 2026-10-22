// Releases what a vehicle keeps in the world: light blocks (ADR 0020, 0038),
// dock cells such as a boat's deck floor and a parked camper's room (ADR 0063,
// 0064, 0068), deck seats (ADR 0063), its stand-in (ADR 0116) and its hold
// pose. Used when a vehicle is removed and when it is no longer loaded.
import type { Entity } from "@minecraft/server";
import type { VehicleId } from "../../../domain/shared/ids";
import type { HoldPose } from "../../../domain/vehicle/dock/floor";
import type { DeckSeats } from "./deckSeats";
import type { DockBlocks } from "./dockBlocks";
import type { HeadlightBlocks } from "./headlightBlocks";
import type { StandIns } from "./standIns";

export class VehicleReleaser {
  constructor(
    private readonly headlightBlocks: Pick<HeadlightBlocks, "shine">,
    private readonly dockBlocks: Pick<DockBlocks, "lay">,
    private readonly deckSeats: Pick<DeckSeats, "keep">,
    private readonly standIns: Pick<StandIns, "keep">,
    private readonly holds: Map<VehicleId, HoldPose>,
  ) {}

  /**
   * `vehicle` is undefined when the entity is gone; its blocks and seats are
   * then only cleared. Every step runs even when an earlier one throws, and
   * the first error is rethrown afterwards.
   */
  release(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    let failure: { error: unknown } | undefined;
    for (const step of [
      () => this.headlightBlocks.shine(vehicleId, vehicle, []),
      () => this.dockBlocks.lay(vehicleId, vehicle, []),
      () => this.deckSeats.keep(vehicleId, vehicle, [], 0),
      () => this.standIns.keep(vehicleId, vehicle, undefined),
      () => this.holds.delete(vehicleId),
    ]) {
      try {
        step();
      } catch (e) {
        failure ??= { error: e };
      }
    }
    if (failure) throw failure.error;
  }
}
