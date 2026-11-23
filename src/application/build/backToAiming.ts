import { backToAiming } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class BackToAiming {
  constructor(private readonly repo: BuildSessionRepository) {}
  backToAiming(cmd: { playerId: PlayerId }): void {
    const session = this.repo.get(cmd.playerId);
    if (session) session.setFlow(backToAiming(session.flow));
  }
}
