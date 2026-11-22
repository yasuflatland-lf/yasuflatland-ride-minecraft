import { confirmLiveHeight } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class ConfirmLiveHeight {
  constructor(private readonly repo: BuildSessionRepository) {}

  /** True when the height was confirmed; the caller opens the shape menu instead of a message. */
  execute({ playerId }: { playerId: PlayerId }): boolean {
    const session = this.repo.get(playerId);
    if (session?.flow.kind !== "baseHeight") return false;
    session.setFlow(confirmLiveHeight(session.flow));
    return true;
  }
}
