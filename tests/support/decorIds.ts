import { asCampingGear } from "../../src/domain/vehicle/kinds/camper/campingGear";
import type {
  DecorItemId,
  DecorSlotId,
} from "../../src/domain/vehicle/kinds/camper/decorData";

export const decorSlotId = (raw: string): DecorSlotId => raw as DecorSlotId;
export function decorItemId(raw: string): DecorItemId {
  const gear = asCampingGear(raw);
  if (gear === undefined) throw new Error(`Unknown fixture gear: ${raw}`);
  return gear;
}
