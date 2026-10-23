import type { PlayerId } from "../../domain/shared/ids";
import { effectivePaint, type Paint } from "../../domain/shared/paint";
import { TickScopedMap } from "../../domain/shared/tickScoped";
import type { RepaintWorld } from "./ports/repaint";

export interface RepaintCommand<Id extends string> {
  playerId: PlayerId;
  entityId: Id;
  paint: Paint;
  tick: number;
}

export class Repaint<Id extends string> {
  // The engine applies a paint on the next tick, so until then paintOf still
  // reports the old color and a second hit in the same tick would repaint and
  // use another dye (ADR 0037). Paints made in the current tick override it.
  private readonly painted = new TickScopedMap<Id, Paint>();

  constructor(private readonly world: RepaintWorld<Id>) {}

  execute(cmd: RepaintCommand<Id>): boolean {
    const current =
      this.painted.get(cmd.tick, cmd.entityId) ??
      this.world.paintOf(cmd.entityId);
    const defaultPaint = this.world.defaultPaintOf(cmd.entityId);
    if (current === undefined || defaultPaint === undefined) return false;
    // A dye of the color the entity already shows would be used up for
    // nothing; the variant-0 slot shows the owner's default paint (ADR 0076).
    if (
      effectivePaint(current, defaultPaint) ===
      effectivePaint(cmd.paint, defaultPaint)
    )
      return false;
    this.world.setPaint(cmd.entityId, cmd.paint);
    this.painted.set(cmd.tick, cmd.entityId, cmd.paint);
    if (!this.world.isCreative(cmd.playerId))
      this.world.consumeDye(cmd.playerId, cmd.paint);
    return true;
  }
}
