// Implements PaintWorld with @minecraft/server (ADR 0012).
import { GameMode } from "@minecraft/server";
import type { PaintWorld } from "../../../application/vehicle/ports/paint";
import type { PlayerId, VehicleId } from "../../../domain/shared/ids";
import { isDyeable, PAINTS, type Paint } from "../../../domain/shared/paint";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import { profileOf } from "../../../domain/vehicle/kinds/index";
import { dyeOf, paintEvent, playPaintSound } from "../../shared/dyes";
import type { BedrockInventory } from "./bedrockInventory";
import type { EntityIndex } from "./entityIndex";
import { entityEventId, kindOfEntity } from "./identifiers";

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
    const kind = kindOfEntity(vehicle.typeId);
    const fixed = kind !== undefined && !isDyeable(profileOf(kind).paintPolicy);
    vehicle.triggerEvent(
      fixed ? entityEventId("normalize_paint") : paintEvent(paint),
    );
  }

  playPaintSound(vehicleId: VehicleId): void {
    const vehicle = this.index.entity(vehicleId);
    if (vehicle) playPaintSound(vehicle);
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
