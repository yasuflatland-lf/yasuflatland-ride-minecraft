import type { PlayerId } from "../../domain/shared/ids";
import { toolFeedback } from "../../domain/vehicle/kinds/index";
import type { RiderWorld } from "./ports/drive";
import type { RiderEffects } from "./riderEffects";

const HEADLIGHT_MESSAGES = new Map([
  ["off", "headlights_off"],
  ["on", "headlights_on"],
]);

export class SwitchFeedback {
  constructor(
    private readonly world: Pick<RiderWorld, "showMessage">,
    private readonly riders: Pick<RiderEffects, "isThirdPerson">,
  ) {}

  show(playerId: PlayerId, item: string, state: string | undefined): void {
    if (state === undefined || !this.riders.isThirdPerson(playerId)) return;
    const message =
      item === "headlight_switch"
        ? HEADLIGHT_MESSAGES.get(state)
        : toolFeedback(item, state);
    if (message !== undefined) this.world.showMessage(playerId, message);
  }
}
