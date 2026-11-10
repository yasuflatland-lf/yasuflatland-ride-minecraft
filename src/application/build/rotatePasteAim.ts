import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class RotatePasteAim {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(cmd: { playerId: PlayerId }): "rotated" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    if (!session?.clipboard) return "ignored";
    return session.rotatePaste() ? "rotated" : "ignored";
  }
}
