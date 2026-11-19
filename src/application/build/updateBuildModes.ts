// Use case: step every listed player's build mode once per tick (ADR 0178, Decision 3).
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { LeaveBuild } from "./leaveBuild";

export type HeldBuildItem = "wand" | "pasteControl" | "undo" | "none";

interface BuildModeInput {
  playerId: PlayerId;
  held: HeldBuildItem;
}

export class UpdateBuildModes {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly leave: LeaveBuild,
  ) {}

  execute(inputs: readonly BuildModeInput[]): void {
    for (const { playerId, held } of inputs) {
      // A session is created only once the player holds the tool, so players
      // who never build cost nothing.
      const session =
        held === "wand"
          ? this.repo.getOrCreate(playerId)
          : this.repo.get(playerId);
      const holding =
        held === "wand" ||
        (held === "pasteControl" &&
          (session?.flow.kind === "pasteAim" ||
            session?.flow.kind === "selected")) ||
        (held === "undo" && session?.isInBuildMode === true);
      if (
        session?.tickMode({ holding }) &&
        !session.isInBuildMode &&
        (session.flow.kind !== "idle" || session.clipboard !== undefined)
      ) {
        this.leave.execute(playerId);
      }
    }
  }

  isInBuildMode(playerId: PlayerId): boolean {
    return this.repo.get(playerId)?.isInBuildMode ?? false;
  }
}
