import type { PlayerId } from "../../domain/shared/ids";

export class NavSelections {
  private readonly pending = new Set<PlayerId>();

  has(playerId: PlayerId): boolean {
    return this.pending.has(playerId);
  }

  begin(playerId: PlayerId): boolean {
    if (this.has(playerId)) return false;
    this.pending.add(playerId);
    return true;
  }

  end(playerId: PlayerId): void {
    this.pending.delete(playerId);
  }
}
