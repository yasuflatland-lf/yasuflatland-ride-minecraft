import { type ChairState, fold, unfold } from "../../domain/resort/beachChair";
import type { BeachChairId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import type { BeachChairFormWorld } from "./ports/beachChairForm";

export class SwitchBeachChairForm {
  constructor(private readonly world: BeachChairFormWorld) {}
  fold(cmd: { id: BeachChairId; player: PlayerId }): boolean {
    return this.change(cmd, fold);
  }
  unfold(cmd: { id: BeachChairId; player: PlayerId }): boolean {
    return this.change(cmd, unfold);
  }
  private change(
    cmd: { id: BeachChairId; player: PlayerId },
    decide: (state: ChairState) => ReturnType<typeof fold>,
  ): boolean {
    const state = this.world.state(cmd.id);
    if (!state) return false;
    const result = decide(state);
    if (!result.ok) {
      if (result.reason !== "wrongForm")
        this.world.showRefused(cmd.player, result.reason);
      return false;
    }
    this.world.setForm(cmd.id, result.to);
    return true;
  }
}
