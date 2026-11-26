import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { InputControls } from "../../domain/vehicle/controls";
import {
  NAV_GUIDES,
  type NavGuideThrottle,
  type NavGuideTrigger,
} from "../../domain/vehicle/navigation/navGuide";
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { NavSelections } from "./navSelections";
import type { NavWorld } from "./ports/drive";

export class GuideNav {
  constructor(
    private readonly repo: VehicleRepository,
    private readonly world: NavWorld,
    private readonly selections: NavSelections,
    private readonly throttle: NavGuideThrottle,
  ) {}

  execute({
    playerId,
    vehicleId,
    controls,
    trigger,
    tick,
  }: {
    playerId: PlayerId;
    vehicleId: VehicleId | undefined;
    controls: InputControls;
    trigger: NavGuideTrigger;
    tick: number;
  }): void {
    if (
      vehicleId === undefined ||
      !this.repo.get(vehicleId)?.isRider(playerId) ||
      this.selections.has(playerId)
    ) {
      return;
    }
    if (this.throttle.allow(playerId, tick, trigger)) {
      this.world.showMessage(playerId, NAV_GUIDES[controls]);
    }
  }
}
