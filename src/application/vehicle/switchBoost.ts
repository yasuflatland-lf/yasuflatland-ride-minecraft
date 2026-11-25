import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import { BOOST_MESSAGES } from "../../domain/vehicle/boost";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { RiderWorld } from "./ports/drive";
import type { Clock } from "./ports/shared";
import type { SwitchFeedback } from "./switchFeedback";

interface SwitchBoostCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
}

export class SwitchBoost {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
    private readonly feedback: SwitchFeedback,
    private readonly world: Pick<RiderWorld, "showMessage">,
  ) {}

  execute(
    { playerId, vehicleId }: SwitchBoostCommand,
    onToggle?: () => void,
  ): boolean {
    const state = this.repo
      .get(vehicleId)
      ?.switchBoost(playerId, this.clock.now());
    if (state === undefined || state === "denied") return false;
    if (state === "unavailable") {
      this.world.showMessage(playerId, "boost_unavailable");
    } else {
      this.feedback.show(playerId, BOOST_MESSAGES, state);
      onToggle?.();
    }
    return true;
  }
}
