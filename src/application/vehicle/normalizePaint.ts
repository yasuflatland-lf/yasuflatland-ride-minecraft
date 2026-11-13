import type { VehicleId } from "../../domain/shared/ids";
import { isDyeable, PAINTS } from "../../domain/shared/paint";
import { profileOf } from "../../domain/vehicle/kinds/index";
import type { PaintWorld } from "./ports/paint";

export class NormalizePaint {
  constructor(private readonly world: PaintWorld) {}

  normalizeFixedPaint(vehicleId: VehicleId): boolean {
    const kind = this.world.kindOf(vehicleId);
    if (kind === undefined || isDyeable(profileOf(kind).paintPolicy))
      return false;
    const stored = this.world.paintOf(vehicleId);
    if (stored === undefined || stored === PAINTS[0]) return false;
    this.world.paint(vehicleId, PAINTS[0]);
    return true;
  }
}
