import type { PlayerId } from "../../domain/shared/ids";
import type { RoofTentStarterWorld } from "./ports/roofTentStarter";

export class GiveStarterRoofTent {
  constructor(private readonly world: RoofTentStarterWorld) {}

  execute(playerId: PlayerId): boolean {
    if (
      this.world.received(playerId) !== false ||
      this.world.isCreative(playerId)
    )
      return false;
    // A failed give leaves the player unmarked so the next join retries.
    this.world.give(playerId);
    this.world.markReceived(playerId);
    return true;
  }
}
