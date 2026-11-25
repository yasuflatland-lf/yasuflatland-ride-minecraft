import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";
import {
  type EquipmentSwitch,
  isEquipmentState,
} from "../../../domain/vehicle/equipment/equipment";
import { equipmentSwitchOf } from "../../../domain/vehicle/kinds/index";

interface ForceEquipmentCommand {
  vehicleId: VehicleId;
  switch: EquipmentSwitch;
  state: string;
}

/** `<vehicleId>,<bareItem>,<state>` sets an equipment switch through the server-only test hook. */
export function parseTestEquipmentMessage(
  message: string,
): ForceEquipmentCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 3) return undefined;
  const [id = "", item = "", state = ""] = parts;
  if (id === "") return undefined;
  const equipmentSwitch = equipmentSwitchOf(item);
  if (!equipmentSwitch || !isEquipmentState(equipmentSwitch, state))
    return undefined;
  return { vehicleId: asVehicleId(id), switch: equipmentSwitch, state };
}
