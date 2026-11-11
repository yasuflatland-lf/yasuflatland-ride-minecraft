import { finishRotateMode } from "../../domain/build/flow/flow";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class FinishRotateMode {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(cmd: { playerId: PlayerId }): "finished" | "ignored" {
    const session = this.repo.get(cmd.playerId);
    if (session?.flow.kind !== "rotateMode") return "ignored";
    session.setFlow(finishRotateMode(session.flow));
    return "finished";
  }
}
