import { closeBuildMenu } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { ShowPreview } from "./showPreview";

export class CloseBuildMenu {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly showPreview: Pick<ShowPreview, "refresh">,
  ) {}
  execute({ playerId, tick = 0 }: { playerId: PlayerId; tick?: number }): void {
    const session = this.repo.get(playerId);
    if (!session) return;
    session.setFlow(closeBuildMenu(session.flow));
    this.showPreview.refresh(playerId, tick);
  }
}
