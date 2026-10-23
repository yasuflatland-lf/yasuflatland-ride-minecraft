// Storage with doors in the parked camper: compartments that show, take and give their items
// only while their door is open. Each unit is a definition (furniture.ts); this module holds
// the code every unit shares and no unit's data (ADR 0114, 0121).

import { SyncedValue } from "../../../shared/syncedValue";
import { TapToggle } from "../../../shared/tapToggle";
import type { StoragePress } from "../../dock/decor";
import type { Face } from "../../dock/floor";
import type { EngineCommand } from "../../drive";
import { DOOR_STEPS, restoredDoorStep, swing } from "./doorSwing";
import type {
  DecorSlot,
  LocalCell,
  StorageCompartmentBlock,
  StoragePlateBlock,
} from "./furniture";
import { CAMPER_SPEC } from "./spec";

/** A slot inside a compartment: an end of the compartment's pair block, behind door `door`. */
export type StorageSlot<Id extends string = string> = Omit<
  DecorSlot,
  "door"
> & { readonly door: Id };

/** One door of a storage unit and the compartment behind it. */
interface StorageDoorDef<Id extends string = string> {
  /** Names the door in DecorSlot.door and in the entity property that swings it. */
  readonly id: Id;
  /** The cell of the compartment's pair block. */
  readonly compartment: LocalCell;
  /** The aisle cell the open door stands in, where a plate takes the taps on it. */
  readonly plate: LocalCell;
  /** 1 when the hinge is at the compartment's front end, -1 at its rear end. */
  readonly hinge: 1 | -1;
  /** The compartment's two ends, end 0 first. */
  readonly slots: readonly StorageSlot<Id>[];
}

/** How a compartment looks this tick: its items show only while `open`. */
export interface CompartmentLook {
  readonly face: Face;
  readonly open: boolean;
  /** The height of the compartment's first slot, its floor above the cell bottom in pixels. */
  readonly height: number;
  readonly end0?: string;
  readonly end1?: string;
}

/** How an open door's plate looks this tick. */
export interface PlateLook {
  readonly face: Face;
  /** Whether the plate stands in a ceiling light's cell while the lights are on, so it gives that light (ADR 0115). */
  readonly lit: boolean;
}

/** A storage unit: its doors, the pair kind of its slots, and the blocks it lays. */
export interface DooredStorage<
  Id extends string = string,
  PairKind extends string = string,
> {
  /** DecorPairEnd.kind of every slot behind its doors; its compartments lay `<pairKind>_decor_pair`. */
  readonly pairKind: PairKind;
  readonly doors: readonly StorageDoorDef<Id>[];
  readonly compartmentBlock: (look: CompartmentLook) => StorageCompartmentBlock;
  readonly plateBlock: (look: PlateLook) => StoragePlateBlock;
  /**
   * The namespace-free name of the block plateBlock lays: a plate in the room's inside layers
   * lets the camper park and leave while its cell holds it (room.ts ownPlateBlock).
   */
  readonly plateBlockName: string;
}

/** A door with the unit it belongs to. */
export type StorageDoor<Id extends string = string> = StorageDoorDef<Id> & {
  readonly unit: DooredStorage<Id>;
};

/** Every door of `units`, in unit order and then door order. */
export function storageDoors<Id extends string>(
  units: readonly DooredStorage<Id>[],
): StorageDoor<Id>[] {
  return units.flatMap((unit) => unit.doors.map((door) => ({ ...door, unit })));
}

/** The cells and slots of a unit's furniture row: one compartment cell per door. */
export function storageFurniture<Id extends string>(
  unit: DooredStorage<Id>,
): { cells: LocalCell[]; slots: StorageSlot<Id>[] } {
  return {
    cells: unit.doors.map(({ compartment }) => compartment),
    slots: unit.doors.flatMap(({ slots }) => slots),
  };
}

function sameLocal(a: LocalCell, b: LocalCell): boolean {
  return a.x === b.x && a.z === b.z && a.layer === b.layer;
}

/** The door whose compartment is `cell`, if any. */
export function compartmentDoorAt<Id extends string>(
  cell: LocalCell,
  doors: readonly StorageDoor<Id>[],
): StorageDoor<Id> | undefined {
  return doors.find((d) => sameLocal(d.compartment, cell));
}

/** The door in `open` whose plate stands in `cell`, if any. */
export function openPlateAt<Id extends string>(
  cell: LocalCell,
  open: ReadonlySet<Id>,
  doors: readonly StorageDoor<Id>[],
): StorageDoor<Id> | undefined {
  return doors.find((d) => open.has(d.id) && sameLocal(d.plate, cell));
}

/** Whether `slot` takes and gives items with the doors in `open`: it is behind none, or behind an open one. */
export function usableBehindDoor<Id extends string>(
  slot: { readonly door?: Id },
  open: ReadonlySet<Id>,
): boolean {
  return slot.door === undefined || open.has(slot.door);
}

/** One door's state: where it is heading, how far it has swung, and its tap window. */
interface DoorState {
  open: boolean;
  step: number;
  readonly toggle: TapToggle;
  readonly sync: SyncedValue<number>;
}

/**
 * The doors of the camper's storage, each swinging in DOOR_STEPS on its own and acting at
 * most once per swing (ADR 0105, 0114).
 */
export class StorageDoors<Id extends string> {
  private readonly states: ReadonlyMap<Id, DoorState>;

  /** `restoredOpen` gives a door's saved swing; a camper that was not `docked` starts with every door shut. */
  constructor(
    doors: readonly { readonly id: Id }[],
    restoredOpen: (id: Id) => unknown,
    docked: boolean,
  ) {
    this.states = new Map(
      doors.map(({ id }) => {
        const step = restoredDoorStep(restoredOpen(id), docked);
        return [
          id,
          {
            open: step * 2 >= DOOR_STEPS,
            step,
            toggle: new TapToggle(CAMPER_SPEC.doorSwingTicks),
            sync: new SyncedValue<number>(),
          },
        ];
      }),
    );
  }

  resync(): void {
    for (const door of this.states.values()) door.sync.resync();
  }

  /** The doors open or opening: their compartments take and give items. */
  open(): ReadonlySet<Id> {
    return new Set(
      [...this.states].filter(([, d]) => d.open).map(([id]) => id),
    );
  }

  /** The doors not yet fully shut: their compartments show their items. */
  shown(): ReadonlySet<Id> {
    return new Set(
      [...this.states].filter(([, d]) => d.step > 0).map(([id]) => id),
    );
  }

  /** Shuts every door at once, as the room folds away. */
  shutAll(): void {
    for (const door of this.states.values()) {
      door.open = false;
      door.step = 0;
    }
  }

  /** Swings every door one step, in door order, and the commands for the swings the entity lacks. */
  swingCommands(
    command: (id: Id, open: number) => EngineCommand,
  ): EngineCommand[] {
    return [...this.states].flatMap(([id, door]) => {
      door.step = swing(door.step, door.open);
      const step = door.sync.next(door.step);
      return step === undefined ? [] : [command(id, step / DOOR_STEPS)];
    });
  }

  /**
   * A press on door `id`'s compartment or plate at `tick`. Within a swing of the door's last
   * action it does nothing (ADR 0105). On an open compartment, `take` takes an item out; when
   * it gives none, or on a shut compartment or the plate, the door toggles.
   */
  press(
    id: Id,
    onCompartment: boolean,
    tick: number,
    take: () => string | undefined,
  ): StoragePress | undefined {
    const door = this.states.get(id);
    if (!door?.toggle.tryToggle(tick)) return undefined;
    if (door.open && onCompartment) {
      const item = take();
      if (item !== undefined) return { kind: "item", item };
    }
    door.open = !door.open;
    return { kind: "door" };
  }
}
