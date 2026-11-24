import type { BuildStructureStore } from "../../../application/build/ports/structures";
import { forEachIsolated } from "../../../application/shared/isolated";
import type { Logger } from "../../../application/shared/ports/logger";
import { BuildSession } from "../../../domain/build/session";
import type { BuildSessionRepository } from "../../../domain/build/sessionRepository";
import type { PlayerId } from "../../../domain/shared/ids";

export class InMemorySessionRepository implements BuildSessionRepository {
  private readonly sessions = new Map<PlayerId, BuildSession>();

  constructor(
    private readonly structures: Pick<BuildStructureStore, "discard">,
    private readonly log: Logger,
  ) {}

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

  update(
    session: BuildSession | undefined,
    change: (session: BuildSession) => void,
  ): void {
    if (!session) return;
    try {
      change(session);
    } finally {
      forEachIsolated(
        session.drainReleased(),
        (handle) => this.structures.discard(handle),
        this.log,
        (handle) =>
          `build structure discard for ${session.playerId} (${handle}) failed`,
      );
    }
  }

  remove(id: PlayerId): void {
    this.update(this.get(id), (session) => {
      session.clearClipboard();
      session.clearHistory();
    });
    this.sessions.delete(id);
  }

  ids(): PlayerId[] {
    return [...this.sessions.keys()];
  }
}
