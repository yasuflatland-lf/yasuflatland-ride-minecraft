// Composition root: one install call per feature (ADR 0046).
// Only here may one feature's output reach another, in both directions (ADR 0122, 0129).
import { installBuild } from "./build/install";
import { installCamp } from "./camp/install";
import { NAMESPACE } from "./shared/identifiers";
import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  // Camp installs second, so the vehicles read its space through this reference.
  // No event or tick runs before bootstrap returns, so nothing reads it unset (ADR 0129).
  let camp: ReturnType<typeof installCamp> | undefined;
  const vehicles = installVehicles({
    isCampSpace: (dimensionId, cell) =>
      camp?.isCampSpace(dimensionId, cell) ?? false,
    wantsChaseCamera: () => false,
    // The router asks the vehicle target first, then the tent lantern, then the Gas Lantern.
    laterSwitchTargets: () => camp?.switchTargets ?? [],
  });
  camp = installCamp({ isVehicleSpace: vehicles.isVehicleSpace });
  installBuild({
    isProtected: (d, c) =>
      vehicles.isVehicleSpace(d, c) || camp.isCampSpace(d, c),
  });
  console.warn(`[${NAMESPACE}] loaded`);
}
