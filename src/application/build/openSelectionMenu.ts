import type { MenuEntry, RootEntryId } from "../../domain/build/flow/menu";
import type { BuildSessionRepository } from "../../domain/build/sessionRepository";
import type { PlayerId } from "../../domain/shared/ids";

export class OpenSelectionMenu {
  constructor(private readonly repo: BuildSessionRepository) {}

  execute({ playerId }: { playerId: PlayerId }): MenuEntry<RootEntryId>[] {
    return this.repo.get(playerId)?.openSelectionMenu() ?? [];
  }
}
