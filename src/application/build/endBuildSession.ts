import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildStructureStore } from "./ports/structures";

export class EndBuildSession {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: Pick<BuildStructureStore, "discard">,
  ) {}

  execute(playerId: PlayerId): void {
    const previous = this.repo.get(playerId)?.clearClipboard();
    if (previous !== undefined) this.structures.discard(previous);
    this.repo.remove(playerId);
  }
}
