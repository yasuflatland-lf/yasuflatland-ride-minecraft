import { adjustHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class ChooseAdjustHeight {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.get(playerId);
    if (session) session.setFlow(adjustHeight(session.flow));
  }
}
