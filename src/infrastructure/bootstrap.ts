// Composition root: one install call per feature (ADR 0046).
// Only here may one feature's output reach another, in both directions (ADR 0122, 0129).
import type { SpaceCheck } from "../application/shared/ports/space";
import { installCamp } from "./camp/install";
import { NAMESPACE } from "./shared/identifiers";
import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  // Camp installs second, so the vehicles read its space through this reference.
  // No event or tick runs before bootstrap returns, so nothing reads it unset (ADR 0129).
  let camp: { isCampSpace: SpaceCheck } | undefined;
  const vehicles = installVehicles({
    isCampSpace: (dimensionId, cell) =>
      camp?.isCampSpace(dimensionId, cell) ?? false,
  });
  camp = installCamp({ isVehicleSpace: vehicles.isVehicleSpace });
  console.warn(`[${NAMESPACE}] loaded`);
}
