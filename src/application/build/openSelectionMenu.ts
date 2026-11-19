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
    const flow = this.repo.get(playerId)?.flow;
    return flow ? shapeMenu(flow) : [];
  }
}
