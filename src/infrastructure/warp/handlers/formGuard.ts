import type { PlayerId } from "../../../domain/shared/ids";
import { WARP_SPEC } from "../../../domain/warp/spec";
import { consoleLogger } from "../../shared/consoleLogger";

export class WarpFormGuard {
  private readonly active = new Map<PlayerId, number>();
  private readonly lastPress = new Map<PlayerId, number>();

  tryOpen(playerId: PlayerId, tick: number): boolean {
    if (this.active.has(playerId)) return false;
    const last = this.lastPress.get(playerId);
    if (last !== undefined && tick - last < WARP_SPEC.pressDebounceTicks)
      return false;
    this.hold(playerId, tick);
    return true;
  }

  hold(playerId: PlayerId, tick: number): void {
    this.active.set(playerId, (this.active.get(playerId) ?? 0) + 1);
    this.lastPress.set(playerId, tick);
  }

  close(playerId: PlayerId): void {
    const count = this.active.get(playerId) ?? 0;
    if (count <= 1) this.active.delete(playerId);
    else this.active.set(playerId, count - 1);
  }

  forget(playerId: PlayerId): void {
    this.lastPress.delete(playerId);
  }

  async run(playerId: PlayerId, flow: () => Promise<unknown>): Promise<void> {
    try {
      await flow();
    } catch (error) {
      consoleLogger.warn(`Warp flow failed: ${error}`);
    } finally {
      this.close(playerId);
    }
  }
}
