import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";

interface ForceToolCommand {
  vehicleId: VehicleId;
  item: string;
  state: string;
}

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
