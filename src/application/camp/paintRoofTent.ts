import { ROOF_TENT_SPEC } from "../../domain/camp/spec";
import type { PlayerId } from "../../domain/shared/ids";
import type { Paint } from "../../domain/shared/paint";
import { Repaint } from "../shared/repaint";
import type { RoofTentWorld } from "./ports/roofTent";

interface PaintRoofTentCommand {
  playerId: PlayerId;
  tentId: string;
  paint: Paint;
  tick: number;
}

export class PaintRoofTent {
  // One Repaint for the whole session, so its same-tick memory (ADR 0037) holds across hits.
  private readonly repaint: Repaint<string>;

  constructor(world: RoofTentWorld) {
    this.repaint = new Repaint<string>({
      paintOf: (tentId) => world.paintOf(tentId),
      // Repaint reads this as the existence check after a paint earlier in the
      // tick, so a tent that is gone must give undefined, not the constant.
      defaultPaintOf: (tentId) =>
        world.paintOf(tentId) === undefined
          ? undefined
          : ROOF_TENT_SPEC.defaultPaint,
      setPaint: (tentId, paint) => world.paint(tentId, paint),
      consumeDye: (playerId, paint) => world.consumeDye(playerId, paint),
      isCreative: (playerId) => world.isCreative(playerId),
    });
  }

  execute(cmd: PaintRoofTentCommand): boolean {
    return this.repaint.execute({
      playerId: cmd.playerId,
      entityId: cmd.tentId,
      paint: cmd.paint,
      tick: cmd.tick,
    });
  }
}
