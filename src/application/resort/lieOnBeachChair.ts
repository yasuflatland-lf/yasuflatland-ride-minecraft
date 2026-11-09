import type { BeachChairId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import type { BeachChairRiderWorld } from "./ports/beachChairRider";

export class LieOnBeachChair {
  private readonly previous = new Map<BeachChairId, PlayerId>();
  constructor(private readonly world: BeachChairRiderWorld) {}

  execute(cmd: { id: BeachChairId; player: PlayerId }): boolean {
    const state = this.world.state(cmd.id);
    if (!state) return false;
    if (state.form !== "chair") {
      this.world.showRefused(cmd.player, "wrongForm");
      return false;
    }
    const rider = this.world.riderOf(cmd.id);
    if (rider !== undefined && rider !== cmd.player) {
      this.world.showRefused(cmd.player, "occupied");
      return false;
    }
    if (rider === undefined && !this.world.seat(cmd.id, cmd.player))
      return false;
    this.previous.set(cmd.id, cmd.player);
    this.world.playLounge(cmd.player);
    return true;
  }

  refresh(loaded: readonly BeachChairId[]): void {
    const present = new Set(loaded);
    for (const id of this.previous.keys())
      if (!present.has(id)) this.previous.delete(id);
    for (const id of loaded) {
      const rider = this.world.riderOf(id);
      const previous = this.previous.get(id);
      // Clear first so a failed placement cannot repeat on every interval.
      this.previous.delete(id);
      if (previous !== undefined && previous !== rider)
        this.world.placeBeside(id, previous);
      if (rider !== undefined) {
        this.previous.set(id, rider);
        this.world.playLounge(rider);
      }
    }
  }
}
