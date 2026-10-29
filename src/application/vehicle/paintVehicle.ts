// Use case: a player hits a vehicle with a dye to repaint its body (ADR 0031, 0036, 0076).

import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Paint } from "../../domain/shared/paint";
import { profileOf } from "../../domain/vehicle/kinds/index";
import { Repaint } from "../shared/repaint";
import type { PaintWorld } from "./ports/paint";
import type { Clock } from "./ports/shared";

export interface PaintVehicleCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  paint: Paint;
}

export class PaintVehicle {
  private readonly repaint: Repaint<VehicleId>;

  constructor(
    world: PaintWorld,
    private readonly clock: Clock,
  ) {
    this.repaint = new Repaint<VehicleId>({
      paintOf: (vehicleId) => world.paintOf(vehicleId),
      defaultPaintOf: (vehicleId) => {
        const kind = world.kindOf(vehicleId);
        return kind === undefined ? undefined : profileOf(kind).defaultPaint;
      },
      setPaint: (vehicleId, paint) => world.paint(vehicleId, paint),
      consumeDye: (playerId, paint) => world.consumeDye(playerId, paint),
      isCreative: (playerId) => world.isCreative(playerId),
    });
  }

  execute(cmd: PaintVehicleCommand): boolean {
    return this.repaint.execute({
      playerId: cmd.playerId,
      entityId: cmd.vehicleId,
      paint: cmd.paint,
      tick: this.clock.now(),
    });
  }
}
