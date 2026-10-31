import type { BuildMenus } from "../../../application/build/ports/menus";
import type { PlayerId } from "../../../domain/shared/ids";

export class StubBuildMenus implements BuildMenus {
  openUtility(_playerId: PlayerId): void {}
}
