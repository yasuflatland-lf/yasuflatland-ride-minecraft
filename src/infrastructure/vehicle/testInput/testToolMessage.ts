import type { ForceToolCommand } from "../../../application/vehicle/switchTool";
import { asVehicleId } from "../../../domain/shared/ids";

/** `<vehicleId>,<bareItem>,<state>` sets a monitor tool through the server-only test hook. */
export function parseTestToolMessage(
  message: string,
): ForceToolCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 3) return undefined;
  const [id = "", item = "", state = ""] = parts;
  if (id === "" || item === "" || state === "") return undefined;
  return { vehicleId: asVehicleId(id), item, state };
}
