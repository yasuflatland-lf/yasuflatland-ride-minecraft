import type { BeachChairId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import { RiderWatch } from "../shared/riderWatch";
import type { BeachChairRiderWorld } from "./ports/beachChairRider";

export class LieOnBeachChair {
  private readonly watch: RiderWatch<BeachChairId>;

  constructor(private readonly world: BeachChairRiderWorld) {
    this.watch = new RiderWatch(
      { riderOf: (id) => this.world.riderOf(id) },
      {
        onSeated: (_id, player) => this.world.playLounge(player),
        onGone: (id, player) => this.world.placeBeside(id, player),
      },
    );
  }

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
    this.world.playLounge(cmd.player);
    this.watch.note(cmd.id, cmd.player);
    return true;
  }

  refresh(loaded: readonly BeachChairId[]): void {
    this.watch.refresh(loaded);
  }
}
