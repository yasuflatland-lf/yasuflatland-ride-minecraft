import type { PlayerId } from "../../domain/shared/ids";

export class PressGaps {
  private readonly last = new Map<PlayerId, number>();

  note(playerId: PlayerId, tick: number): number {
    const previous = this.last.get(playerId);
    this.last.set(playerId, tick);
    return previous === undefined ? Number.POSITIVE_INFINITY : tick - previous;
  }

  forget(playerId: PlayerId): void {
    this.last.delete(playerId);
  }
}
