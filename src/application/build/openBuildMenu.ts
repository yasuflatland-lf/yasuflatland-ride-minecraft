import { openBuildMenu } from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { ShowPreview } from "./showPreview";

export class OpenBuildMenu {
  constructor(
    private readonly repo: BuildSessionRepository,
    private readonly showPreview: Pick<ShowPreview, "refresh">,
  ) {}
  execute({ playerId }: { playerId: PlayerId }): void {
    const session = this.repo.get(playerId);
    if (!session) return;
    session.setFlow(openBuildMenu(session.flow));
    this.showPreview.refresh(playerId, 0);
  }
}
