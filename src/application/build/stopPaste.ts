import { cancel } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class StopPaste {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(cmd: { playerId: PlayerId }): void {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind === "pasteAim")
      session.setFlow(cancel(session.flow));
  }
}
