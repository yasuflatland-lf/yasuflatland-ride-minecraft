import { asVehicleId, type VehicleId } from "../../../domain/shared/ids";

export interface TestHeldToolMessage {
  readonly vehicleId: VehicleId;
  readonly item: string | undefined;
}

export function parseTestHeldToolMessage(
  message: string,
): TestHeldToolMessage | undefined {
  const parts = message.split(",");
  const [vehicleId, item] = parts;
  if (parts.length !== 2 || !vehicleId || !item) return undefined;
  return {
    vehicleId: asVehicleId(vehicleId),
    item: item === "clear" ? undefined : item,
  };
}
