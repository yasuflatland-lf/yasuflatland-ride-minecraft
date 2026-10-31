// Use case: step every listed player's build mode once per tick (ADR 0178, Decision 3).
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export interface BuildModeInput {
  playerId: PlayerId;
  holding: boolean;
}

export class UpdateBuildModes {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(inputs: readonly BuildModeInput[]): void {
    for (const { playerId, holding } of inputs) {
      // A session is created only once the player holds the tool, so players
      // who never build cost nothing.
      const session = holding
        ? this.repo.getOrCreate(playerId)
        : this.repo.get(playerId);
      session?.tickMode({ holding });
    }
  }

  isInBuildMode(playerId: PlayerId): boolean {
    return this.repo.get(playerId)?.isInBuildMode ?? false;
  }
}
