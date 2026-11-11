import type { PlayerId } from "../../domain/shared/ids";

export interface RiderWatchPort<Id> {
  riderOf(id: Id): PlayerId | undefined;
}

export interface RiderWatchHandlers<Id> {
  onSeated?(id: Id, player: PlayerId): void;
  onGone(id: Id, player: PlayerId): void;
}

export class RiderWatch<Id> {
  private readonly previous = new Map<Id, PlayerId>();

  constructor(
    private readonly port: RiderWatchPort<Id>,
    private readonly handlers: RiderWatchHandlers<Id>,
  ) {}

  note(id: Id, player: PlayerId): void {
    this.previous.set(id, player);
  }

  refresh(loaded: readonly Id[]): void {
    const present = new Set(loaded);
    for (const id of this.previous.keys())
      if (!present.has(id)) this.previous.delete(id);
    for (const id of loaded) {
      const rider = this.port.riderOf(id);
      const previous = this.previous.get(id);
      // Clear first so a failed handler cannot repeat on every interval.
      this.previous.delete(id);
      if (previous !== undefined && previous !== rider)
        this.handlers.onGone(id, previous);
      if (rider !== undefined) {
        this.previous.set(id, rider);
        this.handlers.onSeated?.(id, rider);
      }
    }
  }
}
