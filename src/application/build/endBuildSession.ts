import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { TapTargets } from "./ports/tapTargets";
import type { PressGaps } from "./pressGaps";

export class EndBuildSession {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly tapTargets: Pick<TapTargets, "hide">,
    private readonly pressGaps: Pick<PressGaps, "forget">,
  ) {}

  execute(playerId: PlayerId): void {
    this.pressGaps.forget(playerId);
    this.tapTargets.hide(playerId);
    this.repo.remove(playerId);
  }
}
