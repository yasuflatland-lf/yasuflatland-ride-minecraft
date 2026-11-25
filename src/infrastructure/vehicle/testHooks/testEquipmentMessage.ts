import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";

interface ForceEquipmentCommand {
  vehicleId: VehicleId;
  item: string;
  state: string;
}

/** `<vehicleId>,<bareItem>,<state>` sets an equipment switch through the server-only test hook. */
export function parseTestEquipmentMessage(
  message: string,
): ForceEquipmentCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 3) return undefined;
  const [id = "", item = "", state = ""] = parts;
  if (id === "" || item === "" || state === "") return undefined;
  return { vehicleId: asVehicleId(id), item, state };
}
