import type { PlayerId } from "../../domain/shared/ids";
import type { SwitchMessages } from "../../domain/vehicle/equipment/equipment";
import type { RiderWorld } from "./ports/drive";
import type { RiderEffects } from "./riderEffects";

export class SwitchFeedback {
  constructor(
    private readonly world: Pick<RiderWorld, "showMessage">,
    private readonly riders: Pick<RiderEffects, "isThirdPerson">,
  ) {}

  show(
    playerId: PlayerId,
    messages: SwitchMessages,
    state: string | undefined,
  ): void {
    if (state === undefined || !this.riders.isThirdPerson(playerId)) return;
    const message = messages.messageFor(state);
    if (message !== undefined) this.world.showMessage(playerId, message);
  }
}
