import type { BuildFlow } from "../../domain/build/flow/flow";
import { pasteMenu } from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class DescribeBuild {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute(playerId: PlayerId): {
    flow: BuildFlow["kind"];
    clipboardHeld: boolean;
    pasteMenu: string[];
  } {
    const session = this.repo.get(playerId);
    return {
      flow: session?.flow.kind ?? "idle",
      clipboardHeld: session?.clipboard !== undefined,
      pasteMenu: pasteMenu({
        hasHistory: session?.hasHistory ?? false,
        skipAir: session?.flow.kind === "pasteAim" && session.flow.skipAir,
      }).map((entry) => entry.id),
    };
  }

  // Existing edit replies include height and Skip air details used by scenarios.
  editStatus(playerId: PlayerId): { flow: BuildFlow; isEditing: boolean } {
    const session = this.repo.get(playerId);
    return {
      flow: session?.flow ?? { kind: "idle" },
      isEditing: session?.isEditing ?? false,
    };
  }
}
