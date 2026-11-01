import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class EndPasting {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(playerId: PlayerId): void {
    this.repo.get(playerId)?.endPasting();
  }
}
