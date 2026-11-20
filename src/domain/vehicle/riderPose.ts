import type { PlayerId } from "../shared/ids";
import type { Ticks } from "../shared/ticks";

interface SeatPoseTable {
  readonly grip: string;
  /** Strongest left to strongest right, with no upright entry. */
  readonly lean: readonly string[];
}

export interface RiderPoseTable {
  /** Indexed by seat slot, the same index as RiderView.slot. */
  readonly seats: readonly SeatPoseTable[];
  readonly refreshTicks: Ticks;
}

export interface PosedRider {
  readonly id: PlayerId;
  readonly slot: number;
}

export function riderPoseOf(table: SeatPoseTable, level: number): string {
  if (level === 0) return table.grip;
  const levels = table.lean.length / 2;
  const clamped = Math.max(-levels, Math.min(levels, level));
  return (
    table.lean[clamped > 0 ? levels - clamped : levels - 1 - clamped] ??
    table.grip
  );
}

export type RiderPoseCommand =
  | {
      readonly type: "play";
      readonly playerId: PlayerId;
      readonly pose: string;
    }
  | { readonly type: "clear"; readonly playerId: PlayerId };

export class RiderPoseState {
  private readonly sent = new Map<PlayerId, string>();

  next(
    table: RiderPoseTable,
    riders: readonly PosedRider[],
    level: number,
    tick: number,
  ): RiderPoseCommand[] {
    const commands: RiderPoseCommand[] = [];
    const aboard = new Set(
      riders
        .filter((rider) => table.seats[rider.slot])
        .map((rider) => rider.id),
    );
    for (const playerId of this.sent.keys()) {
      if (aboard.has(playerId)) continue;
      commands.push({ type: "clear", playerId });
      this.sent.delete(playerId);
    }
    const refresh = tick % table.refreshTicks === 0;
    for (const { id: playerId, slot } of riders) {
      const seat = table.seats[slot];
      if (!seat) continue;
      const pose = riderPoseOf(seat, level);
      if (refresh || this.sent.get(playerId) !== pose) {
        commands.push({ type: "play", playerId, pose });
        this.sent.set(playerId, pose);
      }
    }
    return commands;
  }

  resync(): void {
    this.sent.clear();
  }
}
