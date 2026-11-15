import type { PlayerId, VehicleId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import type { DecorItemId } from "../../domain/vehicle/dock/decor";
// Use case: a player pressed a parked vehicle's storage with doors, such as the wall cabinet,
// with an empty hand (ADR 0114, 0121).
import type { VehicleRepository } from "../../domain/vehicle/vehicleRepository";
import type { DecorPlacingWorld } from "./ports/decor";
import type { Clock } from "./ports/shared";

interface PressStorageCommand {
  playerId: PlayerId;
  vehicleId: VehicleId;
  /** The world cell of the pressed block: a compartment or an open door's plate. */
  cell: Vec3;
  /** Where the press hit the block, to tell the two items of a compartment apart. */
  point?: Vec3;
  /** False for an opening/front press that must toggle without taking its contents. */
  takeContents?: boolean;
  /** View ray used by shared-cell storage to distinguish fronts, contents and surfaces. */
  eye?: Vec3;
  /** Held gear opens closed storage before its placement path handles open storage. */
  openOnly?: boolean;
  /** Set only when the pressed block itself is the drawers block and its face is a side. */
  drawersSideFace?: boolean;
}

export class PressStorage {
  constructor(
    private readonly world: Pick<
      DecorPlacingWorld,
      "saveDecor" | "giveDecorItems"
    >,
    private readonly repo: VehicleRepository,
    private readonly clock: Clock,
  ) {}

  drawerTarget(
    vehicleId: VehicleId,
    eye: Vec3,
    direction: Vec3,
    cell?: Vec3,
    item?: DecorItemId,
    feet?: Vec3,
  ) {
    return this.repo
      .get(vehicleId)
      ?.asRoom()
      ?.drawerTarget?.(eye, direction, cell, item, feet);
  }

  /** Returns whether the press did anything; an item taken out is saved and given. */
  execute(cmd: PressStorageCommand): boolean {
    const room = this.repo.get(cmd.vehicleId)?.asRoom();
    const press = room?.pressStorage(
      cmd.cell,
      cmd.point,
      this.clock.now(),
      cmd.takeContents,
      cmd.eye,
      cmd.openOnly,
      cmd.drawersSideFace,
    );
    if (!room || !press) return false;
    if (press.kind === "item") {
      this.world.saveDecor(cmd.vehicleId, room.decor());
      this.world.giveDecorItems(cmd.playerId, [press.item]);
    }
    return true;
  }
}
