// Use case: a player hits a tent with a dye to repaint its fly (ADR 0031, 0036, 0076, 0135).
import { TENT_SPEC } from "../../domain/camp/spec";
import type { TentId } from "../../domain/camp/tent";
import type { PlayerId } from "../../domain/shared/ids";
import type { Paint } from "../../domain/shared/paint";
import { Repaint } from "../shared/repaint";
import type { TentPaintWorld } from "./ports/tentPaint";

export interface PaintTentCommand {
  playerId: PlayerId;
  tentId: TentId;
  paint: Paint;
  tick: number;
}

export class PaintTent {
  // One Repaint for the whole session, so its same-tick memory (ADR 0037) holds across hits.
  private readonly repaint: Repaint<TentId>;

  constructor(world: TentPaintWorld) {
    this.repaint = new Repaint<TentId>({
      paintOf: (tentId) => world.paintOf(tentId),
      // Repaint reads this as the existence check after a paint earlier in the
      // tick, so a tent that is gone must give undefined, not the constant.
      defaultPaintOf: (tentId) =>
        world.paintOf(tentId) === undefined
          ? undefined
          : TENT_SPEC.defaultPaint,
      setPaint: (tentId, paint) => world.paint(tentId, paint),
      consumeDye: (playerId, paint) => world.consumeDye(playerId, paint),
      isCreative: (playerId) => world.isCreative(playerId),
    });
  }

  /** Returns whether the tent was repainted. */
  execute(cmd: PaintTentCommand): boolean {
    return this.repaint.execute({
      playerId: cmd.playerId,
      entityId: cmd.tentId,
      paint: cmd.paint,
      tick: cmd.tick,
    });
  }
}
