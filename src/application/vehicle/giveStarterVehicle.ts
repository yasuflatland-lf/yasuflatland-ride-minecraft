import type { PlayerId } from "../../domain/shared/ids";
// Use case: give each player one item of each starter kind the first time they join the world (ADR 0023).
import { STARTER_KINDS } from "../../domain/vehicle/placement/starter";
import type { StarterWorld } from "./ports/placement";

export class GiveStarterVehicle {
  constructor(private readonly world: StarterWorld) {}

  execute(playerId: PlayerId): boolean {
    let gave = false;
    for (const kind of STARTER_KINDS) {
      if (this.world.receivedStarter(playerId, kind) !== false) continue;
      // Marking only after giving leaves this kind and every later kind unmarked
      // when a give throws, so the next join retries them.
      this.world.giveVehicleItem(playerId, kind);
      this.world.markStarterReceived(playerId, kind);
      gave = true;
    }
    return gave;
  }
}
