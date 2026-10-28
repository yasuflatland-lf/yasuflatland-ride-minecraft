import { BuildSession } from "../../../domain/build/session";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";

export class InMemorySessionRepository implements BuildSessionRepository {
  private readonly sessions = new Map<PlayerId, BuildSession>();

  get(id: PlayerId): BuildSession | undefined {
    return this.sessions.get(id);
  }

  getOrCreate(id: PlayerId): BuildSession {
    let session = this.get(id);
    if (!session) {
      session = new BuildSession(id);
      this.sessions.set(id, session);
    }
    return session;
  }

  remove(id: PlayerId): void {
    this.sessions.delete(id);
  }

  ids(): PlayerId[] {
    return [...this.sessions.keys()];
  }
}
