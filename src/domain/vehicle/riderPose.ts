import type { PlayerId } from "../shared/ids";

export interface RiderPoseTable {
  readonly grip: string;
  /** Strongest left to strongest right, with no upright entry. */
  readonly lean: readonly string[];
  readonly refreshTicks: number;
}

export function riderPoseOf(table: RiderPoseTable, level: number): string {
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
    riders: readonly PlayerId[],
    level: number,
    tick: number,
  ): RiderPoseCommand[] {
    const commands: RiderPoseCommand[] = [];
    const aboard = new Set(riders);
    for (const playerId of this.sent.keys()) {
      if (aboard.has(playerId)) continue;
      commands.push({ type: "clear", playerId });
      this.sent.delete(playerId);
    }
    const pose = riderPoseOf(table, level);
    const refresh = tick % table.refreshTicks === 0;
    for (const playerId of riders) {
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
