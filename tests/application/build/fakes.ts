import type {
  BuildFeedback,
  BuildMessage,
  OutlineStyle,
} from "../../../src/application/build/ports/feedback";
import type { RiderGate } from "../../../src/application/build/ports/rider";
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

export class FakeGate implements RiderGate {
  riding = true;
  feet: { dimensionId: DimensionId; cell: Cell } | undefined = {
    dimensionId: overworld,
    cell: { x: 0, y: 64, z: 0 },
  };
  ridesBulldozer() {
    return this.riding;
  }
  bulldozerFeet() {
    return this.riding ? this.feet : undefined;
  }
}

export class FakeFeedback implements BuildFeedback {
  messages: { message: BuildMessage; count?: number }[] = [];
  outlines: { dimensionId: DimensionId; box: Box; style: OutlineStyle }[] = [];
  showMessage(_player: PlayerId, message: BuildMessage, count?: number) {
    this.messages.push({ message, count });
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
