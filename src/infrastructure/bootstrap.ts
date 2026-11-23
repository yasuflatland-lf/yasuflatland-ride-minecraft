// Feature composition root (ADR 0046).
// Only here may one feature's output reach another, in both directions (ADR 0122, 0129).
import { excludedEntityType } from "./build/excludedEntityType";
import { installBuild } from "./build/install";
import { installBuildTestHooks } from "./build/testHooks/install";
import { installCamp } from "./camp/install";
import { installResort } from "./resort/install";
import { NAMESPACE } from "./shared/identifiers";
import { TopHostRegistry } from "./shared/tableTop/registry";
import { installVehicles } from "./vehicle/install";
import { WARP_BLOCK_TYPE } from "./warp/identifiers";
import { installWarp } from "./warp/install";

export function bootstrap(): void {
  const topHosts = new TopHostRegistry();
  // Camp installs second, so the vehicles read its space through this reference.
  // No event or tick runs before bootstrap returns, so nothing reads it unset (ADR 0129).
  let camp: ReturnType<typeof installCamp> | undefined;
  const vehicles = installVehicles({
    isCampSpace: (dimensionId, cell) =>
      camp?.isCampSpace(dimensionId, cell) ?? false,
    // The router asks the vehicle target first, then the tent lantern, then the Gas Lantern.
    laterSwitchTargets: () => camp?.switchTargets ?? [],
  });
  camp = installCamp({
    topHosts,
    isVehicleSpace: vehicles.isVehicleSpace,
    vehicleHost: vehicles.vehicleHost,
  });
  installResort({
    topHosts,
    isVehicleSpace: vehicles.isVehicleSpace,
    isCampSpace: camp.isCampSpace,
    placeHostedOnTop: camp.placeHostedOnTop,
  });
  const build = installBuild({
    isExcludedEntityType: excludedEntityType(vehicles.isFleetEntityType),
    isProtected: (d, c) =>
      vehicles.isVehicleSpace(d, c) || camp.isCampSpace(d, c),
    // Only a player's placement registers a warp point, so Copy must not
    // duplicate the block (docs/specs/warp.md, Registration).
    uncopyableBlockTypes: [WARP_BLOCK_TYPE],
  });
  installBuildTestHooks(build);
  installWarp();
  console.warn(`[${NAMESPACE}] loaded`);
}
