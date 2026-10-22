// Composition root: one install call per feature (ADR 0046). Only here may one
// feature's output reach another: the camp feature asks the vehicles' space (ADR 0121).
import { installCamp } from "./camp/install";
import { NAMESPACE } from "./shared/identifiers";
import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  const vehicles = installVehicles();
  installCamp({ isVehicleSpace: vehicles.isVehicleSpace });
  console.warn(`[${NAMESPACE}] loaded`);
}
