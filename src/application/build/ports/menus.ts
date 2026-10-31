import type { PlayerId } from "../../../domain/shared/ids";

export interface BuildMenus {
  openUtility(playerId: PlayerId): void;
}
