import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildStructureStore } from "./ports/structures";

export class EndBuildSession {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: Pick<BuildStructureStore, "discard">,
  ) {}

  execute(playerId: PlayerId): void {
    for (const handle of this.repo.get(playerId)?.discardHistory() ?? [])
      this.structures.discard(handle);
    this.repo.remove(playerId);
  }
}
