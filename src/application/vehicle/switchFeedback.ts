import type { PlayerId } from "../../domain/shared/ids";
import type { RiderWorld } from "./ports/drive";
import type { RiderEffects } from "./riderEffects";

const MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  blade_switch: { down: "blade_down", up: "blade_up" },
  wide_blade_switch: { normal: "wide_blade_normal", wide: "wide_blade_wide" },
  road_paver_switch: { off: "road_paver_off", on: "road_paver_on" },
  headlight_switch: { off: "headlights_off", on: "headlights_on" },
};

export class SwitchFeedback {
  constructor(
    private readonly world: Pick<RiderWorld, "showMessage">,
    private readonly riders: Pick<RiderEffects, "isThirdPerson">,
  ) {}

  show(playerId: PlayerId, item: string, state: string | undefined): void {
    if (state === undefined || !this.riders.isThirdPerson(playerId)) return;
    const states = Object.hasOwn(MESSAGES, item) ? MESSAGES[item] : undefined;
    const message =
      states && Object.hasOwn(states, state) ? states[state] : undefined;
    if (message !== undefined) this.world.showMessage(playerId, message);
  }
}
