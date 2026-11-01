import { setHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class SetHeightTo {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; height: number }): void {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "heightStep" || session.flow.heightLocked)
      return;
    session.setFlow(setHeight(session.flow, cmd.height));
  }
}
