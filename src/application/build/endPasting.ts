import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { BuildStructureStore } from "./ports/structures";

export class EndPasting {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly structures: Pick<BuildStructureStore, "discard">,
  ) {}

  execute(playerId: PlayerId): void {
    const previous = this.repo.get(playerId)?.endPasting();
    if (previous !== undefined) this.structures.discard(previous);
  }
}
