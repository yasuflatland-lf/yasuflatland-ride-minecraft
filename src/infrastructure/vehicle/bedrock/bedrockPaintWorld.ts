// Implements PaintWorld with @minecraft/server (ADR 0012).
import { GameMode } from "@minecraft/server";
import type { PaintWorld } from "../../../application/vehicle/ports/paint";
import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import { PAINTS, type Paint } from "../../../domain/vehicle/paint/paint";
import type { BedrockInventory } from "./bedrockInventory";
import type { EntityIndex } from "./entityIndex";
import { dyeOf, kindOfEntity, paintEvent } from "./identifiers";

export class BedrockPaintWorld implements PaintWorld {
  constructor(
    private readonly index: EntityIndex,
    private readonly inventory: BedrockInventory,
  ) {}

  paintOf(vehicleId: VehicleId): Paint | undefined {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return undefined;
    const variant = vehicle.getComponent("minecraft:variant")?.value ?? 0;
    return PAINTS[variant];
  }

  kindOf(vehicleId: VehicleId): VehicleKind | undefined {
    return kindOfEntity(this.index.entity(vehicleId)?.typeId);
  }

  paint(vehicleId: VehicleId, paint: Paint): void {
    const vehicle = this.index.entity(vehicleId);
    if (!vehicle) return;
    vehicle.triggerEvent(paintEvent(paint));
    vehicle.dimension.playSound("dye.use", vehicle.location);
  }

  consumeDye(playerId: PlayerId, paint: Paint): void {
    this.inventory.consumeHeld(playerId, dyeOf(paint));
  }
  isCreative(playerId: PlayerId): boolean {
    const player = this.index.player(playerId);
    // getGameMode throws on a handle whose player has left (isValid false).
    return (
      player?.isValid === true && player.getGameMode() === GameMode.Creative
    );
  }
}
