// Implements PaintWorld with @minecraft/server (ADR 0012).
import type { PaintWorld } from "../../../application/vehicle/ports";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import { PAINTS, type Paint } from "../../../domain/vehicle/paint";
import type { BedrockInventory } from "./bedrockInventory";
import type { EntityIndex } from "./entityIndex";
import { dyeOf, kindOfEntity, PAINT_VARIANT, paintEvent } from "./identifiers";

export class BedrockPaintWorld implements PaintWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly inventory: BedrockInventory,
  ) {}

  paintOf(vehicleId: string): Paint | undefined {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return undefined;
    const variant = vehicle.getComponent("minecraft:variant")?.value ?? 0;
    return PAINTS.find((p) => PAINT_VARIANT[p] === variant);
  }

  kindOf(vehicleId: string): VehicleKind | undefined {
    return kindOfEntity(this.index.entity(vehicleId)?.typeId);
  }

  paint(vehicleId: string, paint: Paint): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.triggerEvent(paintEvent(paint));
    vehicle.dimension.playSound("dye.use", vehicle.location);
  }

  consumeDye(playerId: string, paint: Paint): void {
    this.inventory.consumeHeld(playerId, dyeOf(paint));
  }
}
