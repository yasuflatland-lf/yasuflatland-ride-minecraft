import type { SetDecorCommand } from "../../../application/vehicle/setDecor";
import { asVehicleId } from "../../../domain/shared/ids";
import {
  isDecorItem,
  parseDecorSlotId,
} from "../../../domain/vehicle/dock/decor";

/** `<vehicleId>,<slot>,<item>` sets a slot and `<vehicleId>,<slot>,clear` empties it. */
export function parseTestDecorMessage(
  message: string,
): SetDecorCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 3 || parts.some((p) => p === "")) return undefined;
  const [id = "", rawSlot = "", item = ""] = parts;
  const slot = parseDecorSlotId(rawSlot);
  if (slot === undefined || !isDecorItem(item)) return undefined;
  return {
    vehicleId: asVehicleId(id),
    slot,
    item: item === "clear" ? undefined : item,
  };
}
