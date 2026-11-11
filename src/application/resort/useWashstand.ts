import type { FurnitureId } from "../../domain/resort/ids";
import { WASHSTAND_SPEC } from "../../domain/resort/shows";
import { washstandInteract } from "../../domain/resort/washstandShow";
import type { ShowSound } from "./ports/showSound";
import type { WashstandWorld } from "./ports/washstandWorld";
import type { ShowStates } from "./showStates";

export class UseWashstand {
  constructor(
    private readonly world: WashstandWorld,
    private readonly states: ShowStates,
    private readonly sound: ShowSound,
  ) {}

  execute(cmd: { id: FurnitureId; now: number }): void {
    const result = washstandInteract(
      this.states.washstands.get(cmd.id) ?? { phase: "idle" },
      cmd.now,
    );
    this.states.washstands.set(cmd.id, result.state);
    if (result.effect !== "start_run") return;
    this.world.setRunning(cmd.id, true);
    this.sound.playAt(WASHSTAND_SPEC.runSound, cmd.id);
  }
}
