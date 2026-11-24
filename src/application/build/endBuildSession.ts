import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { TapTargets } from "./ports/tapTargets";

export class EndBuildSession {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly tapTargets: Pick<TapTargets, "hide">,
  ) {}

  execute(playerId: PlayerId): void {
    this.tapTargets.hide(playerId);
    this.repo.remove(playerId);
  }
}
