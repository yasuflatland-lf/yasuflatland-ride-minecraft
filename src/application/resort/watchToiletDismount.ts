import type { FurnitureId } from "../../domain/resort/ids";
import { TOILET_SPEC } from "../../domain/resort/shows";
import { toiletRiderGone } from "../../domain/resort/toiletShow";
import type { PlayerId } from "../../domain/shared/ids";
import { RiderWatch } from "../shared/riderWatch";
import type { ShowSound } from "./ports/showSound";
import type { ToiletWorld } from "./ports/toiletWorld";
import type { ShowStates } from "./showStates";

export class WatchToiletDismount {
  private readonly watch: RiderWatch<FurnitureId>;

  constructor(
    private readonly world: ToiletWorld,
    private readonly states: ShowStates,
    sound: ShowSound,
    now: () => number,
  ) {
    this.watch = new RiderWatch(
      { riderOf: (id) => this.world.riderOf(id) },
      {
        onSeated: (id, player) => {
          if (this.states.toilets.get(id)?.phase === "flushing") return;
          this.states.toilets.set(id, { phase: "seated", rider: player });
        },
        onGone: (id, player) => {
          const result = toiletRiderGone(
            this.states.toilets.get(id) ?? { phase: "empty" },
            now(),
          );
          this.states.toilets.set(id, result.state);
          if (result.effect !== "start_flush") return;
          this.world.setFlushing(id, true);
          sound.playAt(TOILET_SPEC.flushSound, id);
          this.world.placeBeside(id, player);
        },
      },
    );
  }

  note(id: FurnitureId, player: PlayerId): void {
    this.watch.note(id, player);
  }

  refresh(): void {
    const loaded = this.world.loadedToilets();
    this.states.retainToilets(loaded);
    this.watch.refresh(loaded);
  }
}
