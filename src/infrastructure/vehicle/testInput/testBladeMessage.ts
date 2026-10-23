import type { ForceBladeCommand } from "../../../application/vehicle/switchBlade";
import { asVehicleId } from "../../../domain/shared/ids";

/** `<vehicleId>,raised` raises the blade and `<vehicleId>,lowered` lowers it. */
export function parseTestBladeMessage(
  message: string,
): ForceBladeCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 2) return undefined;
  const [id = "", state = ""] = parts;
  if (id === "" || (state !== "raised" && state !== "lowered"))
    return undefined;
  return { vehicleId: asVehicleId(id), raised: state === "raised" };
}
