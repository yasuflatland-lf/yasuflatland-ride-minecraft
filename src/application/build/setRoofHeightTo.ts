import { setRoofHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class SetRoofHeightTo {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; height: number }): void {
    const session = this.repo.get(cmd.playerId);
    if (session) session.setFlow(setRoofHeight(session.flow, cmd.height));
  }
}
