import type { PlayerId } from "../shared/ids";
import type { BuildSession } from "./session";

export interface BuildSessionRepository {
  get(id: PlayerId): BuildSession | undefined;
  /** The player's session, created on first use. */
  getOrCreate(id: PlayerId): BuildSession;
  remove(id: PlayerId): void;
  ids(): PlayerId[];
}
