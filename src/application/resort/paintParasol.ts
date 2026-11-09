import type { ParasolId } from "../../domain/resort/ids";
import type { PlayerId } from "../../domain/shared/ids";
import type { Paint } from "../../domain/shared/paint";
import type { Repaint } from "../shared/repaint";

export class PaintParasol {
  constructor(private readonly repaint: Repaint<ParasolId>) {}

  execute(cmd: {
    playerId: PlayerId;
    parasolId: ParasolId;
    paint: Paint;
    tick: number;
  }): boolean {
    return this.repaint.execute({
      playerId: cmd.playerId,
      entityId: cmd.parasolId,
      paint: cmd.paint,
      tick: cmd.tick,
    });
  }
}
