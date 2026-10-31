import type { BuildAnchor } from "../../../src/application/build/ports/anchor";
import type { BuildBlockWorld } from "../../../src/application/build/ports/blocks";
import type {
  BuildFeedback,
  BuildMessage,
  OutlineStyle,
} from "../../../src/application/build/ports/feedback";
import { AIR, type BlockState } from "../../../src/domain/build/blockState";
import type { Box } from "../../../src/domain/build/box";
import { BuildSession } from "../../../src/domain/build/session";
import type { BuildSessionRepository } from "../../../src/domain/build/sessionRepository";
import type { Cell } from "../../../src/domain/shared/cells";
import type { DimensionId, PlayerId } from "../../../src/domain/shared/ids";
import { asDimensionId } from "../../../src/domain/shared/ids";

export const overworld = asDimensionId("minecraft:overworld");
export const nether = asDimensionId("minecraft:nether");

export class FakeSessions implements BuildSessionRepository {
  private readonly sessions = new Map<PlayerId, BuildSession>();
  get(id: PlayerId) {
    return this.sessions.get(id);
  }
  getOrCreate(id: PlayerId) {
    let session = this.sessions.get(id);
    if (!session) {
      session = new BuildSession(id);
      this.sessions.set(id, session);
    }
    return session;
  }
  remove(id: PlayerId) {
    this.sessions.delete(id);
  }
  ids() {
    return [...this.sessions.keys()];
  }
}

export class FakeAnchor implements BuildAnchor {
  feet: { dimensionId: DimensionId; cell: Cell } | undefined = {
    dimensionId: overworld,
    cell: { x: 0, y: 64, z: 0 },
  };
  feetOf() {
    return this.feet;
  }
}

export class FakeFeedback implements BuildFeedback {
  messages: { message: BuildMessage; count?: number }[] = [];
  corners: { playerId: PlayerId; dimensionId: DimensionId; cell: Cell }[] = [];
  outlines: { dimensionId: DimensionId; box: Box; style: OutlineStyle }[] = [];
  showMessage(_player: PlayerId, message: BuildMessage, count?: number) {
    this.messages.push({ message, count });
  }
  drawCorner(playerId: PlayerId, dimensionId: DimensionId, cell: Cell) {
    this.corners.push({ playerId, dimensionId, cell });
  }
  drawOutline(
    _player: PlayerId,
    dimensionId: DimensionId,
    box: Box,
    style: OutlineStyle,
  ) {
    this.outlines.push({ dimensionId, box, style });
  }
}

export class FakeWorld implements BuildBlockWorld {
  private readonly blocks = new Map<string, BlockState>();
  readonly protectedCells = new Set<string>();
  readonly refusedCells = new Set<string>();
  readonly unreadableCells = new Set<string>();
  writes = 0;
  stateAt(_d: DimensionId, cell: Cell) {
    if (this.unreadableCells.has(cellKey(cell))) return undefined;
    return this.blocks.get(cellKey(cell)) ?? AIR;
  }
  setState(_d: DimensionId, cell: Cell, state: BlockState) {
    if (this.refusedCells.has(cellKey(cell))) return false;
    this.writes++;
    this.blocks.set(cellKey(cell), state);
    return true;
  }
  mayEdit(_d: DimensionId, cell: Cell) {
    return !this.protectedCells.has(cellKey(cell));
  }
  put(cell: Cell, state: BlockState) {
    this.blocks.set(cellKey(cell), state);
  }
}

export function cellKey(c: Cell): string {
  return `${c.x},${c.y},${c.z}`;
}
