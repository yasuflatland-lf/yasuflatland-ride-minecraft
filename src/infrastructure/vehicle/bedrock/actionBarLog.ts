import type { PlayerId } from "../../../domain/shared/ids";
import type { ActionBarMessage } from "../../shared/players";
import type { EntityIndex } from "./entityIndex";

export class ActionBarLog {
  private readonly writtenAt = new Map<PlayerId, number>();

  constructor(
    private readonly index: EntityIndex,
    private readonly now: () => number,
  ) {}

  write(playerId: PlayerId, text: ActionBarMessage): void {
    try {
      const player = this.index.player(playerId);
      if (!player) return;
      player.onScreenDisplay.setActionBar(text);
      this.writtenAt.set(playerId, this.now());
    } catch {
      // The player can leave between the lookup and the send.
    }
  }
}
