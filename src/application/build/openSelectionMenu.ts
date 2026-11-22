import { withoutStepBack } from "../../domain/build/flow/flow";
import {
  type MenuEntry,
  type RootEntryId,
  shapeMenu,
} from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class OpenSelectionMenu {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute({ playerId }: { playerId: PlayerId }): MenuEntry<RootEntryId>[] {
    const session = this.repo.get(playerId);
    const flow = session?.flow;
    if (!session || flow?.kind !== "selected" || flow.menuLevel !== "root")
      return [];
    session.setFlow(withoutStepBack(flow));
    return shapeMenu(flow);
  }
}
