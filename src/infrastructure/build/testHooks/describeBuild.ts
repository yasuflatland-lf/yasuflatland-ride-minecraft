import { pasteMenu } from "../../../domain/build/flow/menu";
import type { BuildFlow } from "../../../domain/build/flow/state";
import {
  NO_TURN,
  type QuarterTurn,
} from "../../../domain/build/rotation/quarterTurn";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";

export class DescribeBuild {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(playerId: PlayerId): {
    flow: BuildFlow["kind"];
    menuLevel: "root" | "build" | undefined;
    clipboardHeld: boolean;
    pasteTurn: QuarterTurn;
    pasteMenu: string[];
  } {
    const session = this.repo.get(playerId);
    return {
      flow: session?.flow.kind ?? "idle",
      menuLevel:
        session?.flow.kind === "selected" ? session.flow.menuLevel : undefined,
      clipboardHeld: session?.clipboard !== undefined,
      pasteTurn: session?.pasteTurn ?? NO_TURN,
      pasteMenu: pasteMenu().map((entry) => entry.id),
    };
  }

  // Existing edit replies include height details used by scenarios.
  editStatus(playerId: PlayerId): { flow: BuildFlow; isEditing: boolean } {
    const session = this.repo.get(playerId);
    return {
      flow: session?.flow ?? { kind: "idle" },
      isEditing: session?.isEditing ?? false,
    };
  }
}
