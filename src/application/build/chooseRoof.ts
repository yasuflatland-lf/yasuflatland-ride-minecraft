import { chooseRoof } from "../../domain/build/flow/flow";
import type { RoofKind } from "../../domain/build/roof/roof";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
export class ChooseRoof {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; kind: RoofKind }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    session.setFlow(chooseRoof(session.flow, cmd.kind));
  }
}
