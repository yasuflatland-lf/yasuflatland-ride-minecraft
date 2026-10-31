import { startPaste } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
export class StartPaste {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; skipAir: boolean }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    session.setFlow(startPaste(session.flow, cmd.skipAir));
  }
}
