import { sameCell } from "../../../shared/cells";
import { SyncedValue } from "../../../shared/syncedValue";
import type { Vec3 } from "../../../shared/vec";
import {
  type DecorItemId,
  parseDecorSlotId,
  type StoragePress,
} from "../../dock/decor";
import type { HoldPose } from "../../dock/floor";
import type { EngineCommand } from "../../drive";
import type { RestoredOf } from "../../entityContract";
import { cellTaken } from "./decor";
import { slotPoint, slotsFor } from "./decorPlacing";
import { StorageDoors } from "./dooredStorage";
import { drawerBlockHit, drawerHit, drawerPressCell } from "./drawerHit";
import {
  type CAMPER_ENTITY,
  drawerItemCommand,
  storageDoorCommand,
  storageDoorProperty,
} from "./entity";
import {
  DRAWER_COMPARTMENT,
  KITCHEN_DRAWERS,
  STORAGE_DOORS,
  type StorageDoorId,
} from "./furniture";
import { localCellAt } from "./parkPose";
import type { DrawerTarget, StoragePressRequest } from "./room";
import type { CamperRoomDecor } from "./roomDecor";
import { DRAWER_GEAR_IDS } from "./spec";
import { storagePressTarget } from "./storagePlates";

export class CamperStorage {
  // The storage doors share the entry door's swing length, each on its own (ADR 0114, 0121).
  private readonly storage: StorageDoors<StorageDoorId>;
  private readonly drawerItemsSync = {
    drawer_top: new SyncedValue<number>(),
    drawer_bottom: new SyncedValue<number>(),
  };

  constructor(restored: RestoredOf<typeof CAMPER_ENTITY>, docked: boolean) {
    this.storage = new StorageDoors(
      STORAGE_DOORS,
      (id) => restored[storageDoorProperty(id)],
      docked,
    );
  }

  open(): ReadonlySet<StorageDoorId> {
    return this.storage.open();
  }

  shown(): ReadonlySet<StorageDoorId> {
    return this.storage.shown();
  }

  /**
   * A press on a storage unit at world `cell` (ADR 0114, 0121). On an open door's plate in the
   * aisle it shuts that door. On a compartment it opens a shut door; on an open one it takes
   * back the item at the end nearest `point`, or shuts the door when that end is empty. A tap
   * may reach the block twice (ADR 0105), so a press within a swing of the door's last
   * action does nothing; otherwise the echo of an opening tap could take an item out.
   * The caller sets `drawersSideFace` only for a side face of the drawers block itself.
   * Its measured height picks the drawer only when `cell` is the drawers compartment;
   * rerouted floor presses keep using the ray, whichever drawers are open.
   */
  press(
    pose: HoldPose,
    decor: CamperRoomDecor,
    request: StoragePressRequest,
  ): StoragePress | undefined {
    let { cell, point } = request;
    const { tick, takeContents, eye, openOnly, drawersSideFace } = request;
    const byHeight =
      drawersSideFace &&
      point !== undefined &&
      sameCell(cell, localCellAt(pose, DRAWER_COMPARTMENT));
    const hit =
      !byHeight && point && eye
        ? drawerBlockHit(
            pose,
            cell,
            eye,
            point,
            decor.placed(),
            this.storage.open(),
          )
        : undefined;
    const counter = drawerPressCell(pose, cell);
    if (counter && !byHeight) {
      if (!hit?.door && !sameCell(cell, counter)) return undefined;
      if (eye && point && !hit?.door) return undefined;
      cell = counter;
    }
    point = hit?.point ?? point;
    const hitDoor = STORAGE_DOORS.find((d) => d.id === hit?.door);
    const target = hitDoor
      ? {
          door: hitDoor,
          onCompartment: true,
        }
      : storagePressTarget(pose, cell, STORAGE_DOORS, point);
    if (!target || (openOnly && this.storage.open().has(target.door.id)))
      return undefined;
    return this.storage.press(
      target.door.id,
      target.onCompartment && (takeContents ?? hit?.takeContents ?? true),
      tick,
      () => decor.takeBehindDoor(pose, cell, target.door.id, point),
    );
  }

  drawerTarget(
    pose: HoldPose,
    decor: CamperRoomDecor,
    eye: Vec3,
    direction: Vec3,
    cell?: Vec3,
    item?: DecorItemId,
    feet?: Vec3,
  ): DrawerTarget | undefined {
    const counter = cell
      ? drawerPressCell(pose, cell)
      : localCellAt(pose, DRAWER_COMPARTMENT);
    if (!counter) return undefined;
    const hit = drawerHit(
      pose,
      eye,
      direction,
      decor.placed(),
      this.storage.open(),
      cell,
    );
    let door = hit?.door;
    if (!door && !hit && item && feet) {
      const aisle = localCellAt(pose, {
        x: 0,
        z: DRAWER_COMPARTMENT.z,
        layer: 1,
      });
      if (
        Math.floor(feet.x) === aisle.x &&
        Math.floor(feet.y) === aisle.y &&
        Math.floor(feet.z) === aisle.z
      ) {
        const free = slotsFor(item, this.storage.open()).filter(
          (s) =>
            KITCHEN_DRAWERS.doors.some((d) => d.id === s.door) &&
            !cellTaken(s, decor.placed()),
        );
        if (free.length === 1) door = free[0]?.door;
      }
    }
    if (!door) return undefined;
    const slot = item
      ? slotsFor(item, this.storage.open()).find(
          (s) => s.door === door && !cellTaken(s, decor.placed()),
        )
      : undefined;
    const definition = STORAGE_DOORS.find((d) => d.id === door);
    const point =
      hit?.point ??
      (definition?.slots[0] && slotPoint(pose, definition.slots[0]));
    if (!point) return undefined;
    return {
      cell: counter,
      point,
      slot: slot?.id,
      open: this.storage.open().has(door),
      floorFootprint: hit?.floorFootprint,
    };
  }

  swingCommands(): EngineCommand[] {
    return this.storage.swingCommands(storageDoorCommand);
  }

  drawerItemCommands(decor: CamperRoomDecor): EngineCommand[] {
    return (["drawer_top", "drawer_bottom"] as const).flatMap((drawer) => {
      const slot = parseDecorSlotId(`${drawer}_0`);
      const item = slot === undefined ? undefined : decor.itemIn(slot);
      const code =
        item === undefined ? 0 : [...DRAWER_GEAR_IDS].indexOf(item) + 1;
      return this.drawerItemsSync[drawer].next(code) === undefined
        ? []
        : [drawerItemCommand(drawer, code)];
    });
  }

  shutAll(): void {
    this.storage.shutAll();
  }

  resync(): void {
    this.storage.resync();
    for (const sync of Object.values(this.drawerItemsSync)) sync.resync();
  }
}
