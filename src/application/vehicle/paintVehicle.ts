// Use case: a player hits a vehicle with a dye to repaint its body (ADR 0031, 0036, 0076).
import { TickScopedMap } from "../../domain/shared/tickScoped";
import { profileOf } from "../../domain/vehicle/kinds/index";
import { effectivePaint, type Paint } from "../../domain/vehicle/paint";
import type { PaintWorld } from "./ports";

export interface PaintVehicleCommand {
  playerId: string;
  vehicleId: string;
  paint: Paint;
  creative: boolean;
  tick: number;
}

export class PaintVehicle {
  // The engine applies a paint on the next tick, so until then paintOf still
  // reports the old color and a second hit in the same tick would repaint and
  // use another dye (ADR 0037). Paints made in the current tick override it.
  private readonly painted = new TickScopedMap<string, Paint>();

  constructor(private readonly world: PaintWorld) {}

  execute(cmd: PaintVehicleCommand): boolean {
    const current =
      this.painted.get(cmd.tick, cmd.vehicleId) ??
      this.world.paintOf(cmd.vehicleId);
    const kind = this.world.kindOf(cmd.vehicleId);
    if (current === undefined || kind === undefined) return false;
    // A dye of the color the vehicle already shows would be used up for
    // nothing; the variant-0 slot shows the kind's default paint (ADR 0076).
    const { defaultPaint } = profileOf(kind);
    if (
      effectivePaint(current, defaultPaint) ===
      effectivePaint(cmd.paint, defaultPaint)
    )
      return false;
    this.world.paint(cmd.vehicleId, cmd.paint);
    this.painted.set(cmd.tick, cmd.vehicleId, cmd.paint);
    if (!cmd.creative) this.world.consumeDye(cmd.playerId, cmd.paint);
    return true;
  }
}
