import type { TentFlapWorld } from "../../../src/application/camp/ports/tentFlap";
import { TentFlaps } from "../../../src/domain/camp/flaps";
import type { FlapId, TentId } from "../../../src/domain/camp/tent";
import type { PlayerId } from "../../../src/domain/shared/ids";

/** An in-memory TentFlapWorld: each listed tent has its own flaps, all closed. */
export class FakeTentFlapWorld implements TentFlapWorld {
  readonly tents = new Map<TentId, TentFlaps>();
  blocked = new Set<FlapId>();
  readonly blockedChecks: { tentId: TentId; flap: FlapId }[] = [];
  readonly hints: PlayerId[] = [];

  addTent(tentId: TentId): TentFlaps {
    const flaps = new TentFlaps(() => 0);
    this.tents.set(tentId, flaps);
    return flaps;
  }
  flapsOf(tentId: TentId): TentFlaps | undefined {
    return this.tents.get(tentId);
  }
  isFlapBlocked(tentId: TentId, flap: FlapId): boolean {
    this.blockedChecks.push({ tentId, flap });
    return this.blocked.has(flap);
  }
  showFlapBlocked(playerId: PlayerId): void {
    this.hints.push(playerId);
  }
}
