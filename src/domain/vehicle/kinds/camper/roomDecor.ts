import type { HoldPose } from "../../dock/floor";
import { currentGearId } from "./campingGear";
import {
  cellTaken,
  DECOR_SLOTS,
  decorFits,
  decorSlot,
  savedSlotId,
  sharingSlots,
} from "./decor";
import {
  type DecorItemId,
  type DecorPlacement,
  type DecorSlotId,
  isDecorItem,
  parseDecor,
} from "./decorData";
import { nearest, slotForPress, slotsAt, slotsFor } from "./decorPlacing";
import { drawerBlockHit, drawerPressCell } from "./drawerHit";
import { type DecorSlot, STORAGE_DOORS, type StorageDoorId } from "./furniture";
import type { DecorFallback, DecorPress, RoomPress } from "./room";
import { storagePressTarget } from "./storagePlates";

export interface ParkedRoom {
  readonly pose: HoldPose;
  readonly open: ReadonlySet<StorageDoorId>;
}

export class CamperRoomDecor {
  private readonly decorBySlot = new Map<DecorSlotId, DecorItemId>();
  // Saved decor whose slot no longer exists and that no free slot could take; it is
  // kept, saved, and given back when the camper breaks (ADR 0103).
  private readonly stowedDecor: DecorPlacement[] = [];

  static restore(saved: unknown): CamperRoomDecor {
    const decor = new CamperRoomDecor();
    // An entry whose slot no longer exists, whose item no longer fits its clearance,
    // or whose cell an earlier entry already holds,
    // moves to the first free slot that takes its item, or is stowed (ADR 0103, 0105). Decor
    // saved in a renamed slot loads as if saved in its new one (ADR 0112), and an item that
    // left the catalog is dropped without being handed back (ADR 0169).
    const entries = parseDecor(saved).flatMap((entry) => {
      const item = currentGearId(entry.item);
      return item === undefined
        ? []
        : [{ slot: savedSlotId(entry.slot), item }];
    });
    const homeless: DecorPlacement[] = [];
    for (const entry of entries) {
      const slot = decorSlot(entry.slot);
      if (
        slot &&
        (slot.items === undefined || slot.items.includes(entry.item)) &&
        !cellTaken(slot, decor.placed())
      )
        decor.decorBySlot.set(slot.id, entry.item);
      else homeless.push(entry);
    }
    // A homeless entry may go into a shut compartment: it is kept there out of sight until the
    // door opens, which beats stowing it out of reach (ADR 0114, 0121).
    const everyDoor = new Set(STORAGE_DOORS.map(({ id }) => id));
    for (const entry of homeless) {
      const free = slotsFor(entry.item, everyDoor).find(
        (slot) => !cellTaken(slot, decor.placed()),
      );
      if (free) decor.decorBySlot.set(free.id, entry.item);
      else decor.stowedDecor.push(entry);
    }
    return decor;
  }

  // The decor in slots, without the stowed entries: a stowed entry may name a slot whose
  // cell another entry holds, and it is neither laid nor counted as taking that cell.
  placed(): DecorPlacement[] {
    return DECOR_SLOTS.flatMap(({ id }) => {
      const item = this.decorBySlot.get(id);
      return item === undefined ? [] : [{ slot: id, item }];
    });
  }

  all(): readonly DecorPlacement[] {
    return [...this.placed(), ...this.stowedDecor];
  }

  itemIn(slot: DecorSlotId): DecorItemId | undefined {
    return this.decorBySlot.get(slot);
  }

  /** Sets or clears one slot; an item replaces whatever a slot sharing its place held (ADR 0107, 0108). */
  set(slot: DecorSlotId, item: DecorItemId | undefined): boolean {
    const target = decorSlot(slot);
    if (!target || (item !== undefined && !isDecorItem(item))) return false;
    if (this.decorBySlot.get(slot) === item) return false;
    if (item === undefined) {
      this.decorBySlot.delete(slot);
      return true;
    }
    if (!this.canSave(target, item)) return false;
    for (const other of sharingSlots(target)) this.decorBySlot.delete(other.id);
    this.decorBySlot.set(slot, item);
    return true;
  }

  canSave(target: DecorSlot, item: DecorItemId): boolean {
    const replaced = new Set(sharingSlots(target).map((s) => s.id));
    return decorFits([
      ...this.placed().filter((d) => !replaced.has(d.slot)),
      ...this.stowedDecor,
      { slot: target.id, item },
    ]);
  }

  slotFor(
    { pose, open }: ParkedRoom,
    item: DecorItemId,
    press: DecorPress,
    fallback: DecorFallback,
  ): DecorSlotId | undefined {
    const { cell, point, eye } = press;
    const hit = eye
      ? drawerBlockHit(pose, cell, eye, point, this.placed(), open)
      : undefined;
    const counter = drawerPressCell(pose, cell);
    if (hit?.door) {
      const slot = slotForPress(
        pose,
        item,
        this.placed(),
        { cell: counter ?? cell, point: hit.point },
        "none",
        open,
        hit.door,
      );
      return slot && this.canSave(slot, item) ? slot.id : undefined;
    }
    if (
      counter &&
      (cell.x !== counter.x || cell.y !== counter.y || cell.z !== counter.z)
    )
      return undefined;
    const slot = slotForPress(
      pose,
      item,
      this.placed(),
      hit ? { ...press, point: hit.point } : press,
      fallback,
      open,
    );
    return slot && this.canSave(slot, item) ? slot.id : undefined;
  }

  place({ open }: ParkedRoom, slot: DecorSlotId, item: DecorItemId): boolean {
    const target = slotsFor(item, open).find((s) => s.id === slot);
    if (!target || cellTaken(target, this.placed())) return false;
    return this.set(slot, item);
  }

  /**
   * Takes back the item in the pressed cell, whichever of the cell's slots holds it (ADR 0107).
   * The table may hold two, and the one nearest `point` is taken, measured
   * along the line of sight from `eye` as when placing (ADR 0108, 0110).
   */
  remove(
    { pose, open }: ParkedRoom,
    { cell, point, eye }: RoomPress,
  ): DecorItemId | undefined {
    const hit =
      point && eye
        ? drawerBlockHit(pose, cell, eye, point, this.placed(), open)
        : undefined;
    if (hit?.door) return undefined;
    if (
      point &&
      storagePressTarget(pose, cell, STORAGE_DOORS, hit?.point ?? point)?.door
        .acceptsPress !== undefined
    )
      return undefined;
    // A storage compartment gives its items back only through a storage press (ADR 0114, 0121).
    const held = slotsAt(pose, cell).filter(
      ({ id, door }) => door === undefined && this.decorBySlot.has(id),
    );
    const slot =
      point === undefined ? held[0] : nearest(pose, held, point, eye);
    if (!slot) return undefined;
    const item = this.decorBySlot.get(slot.id);
    this.set(slot.id, undefined);
    return item;
  }

  takeBehindDoor(
    pose: HoldPose,
    { cell, point }: RoomPress,
    door: StorageDoorId,
  ): DecorItemId | undefined {
    const ends = slotsAt(pose, cell).filter((s) => s.door === door);
    const end =
      point === undefined
        ? ends.find(({ id }) => this.decorBySlot.has(id))
        : nearest(pose, ends, point, undefined);
    const item = end && this.decorBySlot.get(end.id);
    if (!end || item === undefined) return undefined;
    this.set(end.id, undefined);
    return item;
  }
}
