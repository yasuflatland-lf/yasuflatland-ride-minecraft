import type { SetDecorCommand } from "../../../../../application/vehicle/room/setDecor";
import { asVehicleId } from "../../../../../domain/shared/ids";
import {
  asCampingGear,
  parseDecorSlotId,
} from "../../../../../domain/vehicle/kinds/index";

/** `<vehicleId>,<slot>,<item>` sets a slot and `<vehicleId>,<slot>,clear` empties it. */
export function parseTestDecorMessage(
  message: string,
): SetDecorCommand | undefined {
  const parts = message.split(",");
  if (parts.length !== 3 || parts.some((p) => p === "")) return undefined;
  const [id = "", rawSlot = "", rawItem = ""] = parts;
  const slot = parseDecorSlotId(rawSlot);
  const item = asCampingGear(rawItem);
  if (slot === undefined || (item === undefined && rawItem !== "clear"))
    return undefined;
  return {
    vehicleId: asVehicleId(id),
    slot,
    item,
  };
}
