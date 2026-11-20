// Releases what a vehicle keeps in the world: light blocks (ADR 0020, 0038),
// dock cells such as a boat's deck floor and a parked camper's room (ADR 0063,
// 0064, 0068), deck seats (ADR 0063), seat fillers (ADR 0120), its stand-in
// (ADR 0116) and its hold pose. Used when a vehicle is removed and when it is no longer loaded.
import type { Entity } from "@minecraft/server";
import type { VehicleId } from "../../../domain/shared/ids";
import type { HoldPose } from "../../../domain/vehicle/dock/floor";
import type { DockLayer } from "./dockLayer";
import type { HeadlightBlocks } from "./headlightBlocks";
import type { PerVehicleState } from "./ownedEntities";

/** Runs every cleanup step before passing the first error to the caller. */
export function runReleaseSteps(steps: Iterable<() => void>): void {
  let failure: { error: unknown } | undefined;
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      failure ??= { error };
    }
  }
  if (failure) throw failure.error;
}

export class VehicleReleaser {
  constructor(
    private readonly headlightBlocks: Pick<HeadlightBlocks, "shine">,
    private readonly dockBlocks: Pick<DockLayer, "lay">,
    private readonly helpers: readonly PerVehicleState[],
    private readonly holds: Map<VehicleId, HoldPose>,
  ) {}

  /**
   * `vehicle` is undefined when the entity is gone; its blocks and seats are
   * then only cleared. Every step runs even when an earlier one throws, and
   * the first error is rethrown afterwards.
   */
  release(vehicleId: VehicleId, vehicle: Entity | undefined): void {
    runReleaseSteps([
      () => this.headlightBlocks.shine(vehicleId, vehicle, []),
      () => this.dockBlocks.lay(vehicleId, vehicle, []),
      ...this.helpers.map((helper) => () => helper.release(vehicleId, vehicle)),
      () => this.holds.delete(vehicleId),
    ]);
  }
}
