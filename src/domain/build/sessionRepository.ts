import type { PlayerId } from "../shared/ids";
import type { BuildSession } from "./session";

export interface BuildSessionRepository {
  get(id: PlayerId): BuildSession | undefined;
  /** The player's session, created on first use. */
  getOrCreate(id: PlayerId): BuildSession;
  /** Runs a synchronous change if the session exists, then disposes of its released structures. */
  update(
    session: BuildSession | undefined,
    change: (session: BuildSession) => void,
  ): void;
  /** Disposes of structures still held by the session before removing it. */
  remove(id: PlayerId): void;
  ids(): PlayerId[];
}
