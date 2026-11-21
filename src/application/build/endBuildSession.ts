import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildStructureStore } from "./ports/structures";
import type { TapTargets } from "./ports/tapTargets";

export class EndBuildSession {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: Pick<BuildStructureStore, "discard">,
    private readonly tapTargets: Pick<TapTargets, "hide">,
  ) {}

  execute(playerId: PlayerId): void {
    this.tapTargets.hide(playerId);
    const session = this.repo.get(playerId);
    const previous = session?.clearClipboard();
    if (previous !== undefined) this.structures.discard(previous);
    for (const handle of session?.clearHistory() ?? [])
      this.structures.discard(handle);
    this.repo.remove(playerId);
  }
}
