// Implements DecorWorld with @minecraft/server (ADR 0012, 0093).
import type { Entity } from "@minecraft/server";
import type { DecorWorld } from "../../../application/vehicle/ports/decor";
import type { VehicleId } from "../../../domain/shared/ids";
import {
  type DecorPlacement,
  serializeDecor,
} from "../../../domain/vehicle/dock/decor";
import type { EntityIndex } from "./entityIndex";
import { DECOR_PROPERTY } from "./identifiers";

/** The decor JSON saved on a vehicle, read when its aggregate is rebuilt. */
export function savedDecor(
  vehicle: Pick<Entity, "getDynamicProperty">,
): string | undefined {
  const raw = vehicle.getDynamicProperty(DECOR_PROPERTY);
  return typeof raw === "string" ? raw : undefined;
}

export class BedrockDecorWorld implements DecorWorld {
  constructor(private readonly index: EntityIndex) {}

  saveDecor(vehicleId: VehicleId, decor: readonly DecorPlacement[]): void {
    this.index
      .entity(vehicleId)
      ?.setDynamicProperty(DECOR_PROPERTY, serializeDecor(decor));
  }
}
