import { toiletTick } from "../../domain/resort/toiletShow";
import { washstandTick } from "../../domain/resort/washstandShow";
import type { ToiletWorld } from "./ports/toiletWorld";
import type { WashstandWorld } from "./ports/washstandWorld";
import type { ShowStates } from "./showStates";

export class TickShows {
  constructor(
    private readonly toilets: ToiletWorld,
    private readonly washstands: WashstandWorld,
    private readonly states: ShowStates,
  ) {}

  tick(now: number): void {
    const toilets = this.toilets.loadedToilets();
    this.states.retainToilets(toilets);
    for (const id of toilets) {
      const result = toiletTick(
        this.states.toilets.get(id) ?? { phase: "empty" },
        now,
      );
      this.states.toilets.set(id, result.state);
      if (result.effect === "end_flush") {
        this.toilets.setFlushing(id, false);
        this.toilets.setLid(id, false);
      }
    }
    const washstands = this.washstands.loadedWashstands();
    this.states.retainWashstands(washstands);
    for (const id of washstands) {
      const result = washstandTick(
        this.states.washstands.get(id) ?? { phase: "idle" },
        now,
      );
      this.states.washstands.set(id, result.state);
      if (result.effect === "end_run") this.washstands.setRunning(id, false);
    }
  }
}
