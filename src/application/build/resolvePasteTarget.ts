import {
  aimedPasteTarget,
  type PasteTarget,
} from "../../domain/build/clipboard/clipboard";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";
import type { AimResult } from "./ports/aim";

export class ResolvePasteTarget {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(command: {
    playerId: PlayerId;
    aim: AimResult;
  }): PasteTarget | undefined {
    const session = this.repo.get(command.playerId);
    if (!session?.clipboard) return undefined;
    return aimedPasteTarget(session.clipboard, command.aim, session.pasteTurn);
  }
}
