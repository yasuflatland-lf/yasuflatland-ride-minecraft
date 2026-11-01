import { chooseHeighted } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { HeightedKind } from "../../domain/build/volume/kind";
import type { PlayerId } from "../../domain/shared/ids";
export class ChooseHeighted {
  constructor(private readonly repo: BuildSessionRepository) {}
  execute(cmd: { playerId: PlayerId; kind: HeightedKind }): void {
    const session = this.repo.getOrCreate(cmd.playerId);
    session.setFlow(chooseHeighted(session.flow, cmd.kind));
  }
}
