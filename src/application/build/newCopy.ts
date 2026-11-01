import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class NewCopy {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(playerId: PlayerId): void {
    const session = this.repo.get(playerId);
    if (session?.flow.kind === "pasteAim") session.startNewCopy();
  }
}
