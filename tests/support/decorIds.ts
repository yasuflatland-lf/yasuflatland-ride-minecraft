import type {
  DecorItemId,
  DecorSlotId,
} from "../../src/domain/vehicle/dock/decor";

export const decorSlotId = (raw: string): DecorSlotId => raw as DecorSlotId;
export const decorItemId = (raw: string): DecorItemId => raw as DecorItemId;
