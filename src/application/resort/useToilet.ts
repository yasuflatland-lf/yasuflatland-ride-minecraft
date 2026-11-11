import type { FurnitureId } from "../../domain/resort/ids";
import { toiletInteract } from "../../domain/resort/toiletShow";
import type { PlayerId } from "../../domain/shared/ids";
import type { ToiletWorld } from "./ports/toiletWorld";
import type { ShowStates } from "./showStates";
import type { WatchToiletDismount } from "./watchToiletDismount";

export class UseToilet {
  constructor(
    private readonly world: ToiletWorld,
    private readonly states: ShowStates,
    private readonly watch: WatchToiletDismount,
  ) {}

  execute(cmd: { id: FurnitureId; player: PlayerId; now: number }): void {
    const result = toiletInteract(
      this.states.toilets.get(cmd.id) ?? { phase: "empty" },
      cmd.player,
    );
    switch (result.effect) {
      case "seat":
        if (!this.world.seat(cmd.id, cmd.player)) return;
        this.states.toilets.set(cmd.id, result.state);
        this.world.setLid(cmd.id, true);
        this.watch.note(cmd.id, cmd.player);
        break;
      case "refuse_occupied":
        this.world.showRefused(cmd.player, "occupied");
        break;
      case "refuse_flushing":
        this.world.showRefused(cmd.player, "flushing");
        break;
    }
  }
}
