import { cellKey } from "../../../shared/cells";
import type { Vec2, Vec3 } from "../../../shared/vec";
import { type DecorPlacement, decorFace } from "../../dock/decor";
import type { DockCell, Face, HoldPose } from "../../dock/floor";
import { pairItems, slotCells } from "./decorCells";
import type {
  HingedStorageDoor,
  StorageDoor,
  StorageOpening,
} from "./dooredStorage";
import {
  CEILING_LIGHTS,
  type LocalCell,
  STORAGE_DOORS,
  type StorageCompartmentBlock,
} from "./furniture";
import { axes, localCellAt } from "./parkPose";
import {
  AIR,
  CEILING_LAYER,
  faceToward,
  INSIDE_LAYERS,
  interior,
  ROOF_LAYER,
} from "./roomGeometry";

// The side of a plate's cell where its door's hinge is, so the plate stands where the open door does.
export function plateFace(
  opening: Extract<StorageOpening, { kind: "hinged" }>,
  f: Vec2,
): Face {
  return faceToward({ x: opening.hinge * f.x, z: opening.hinge * f.z });
}

function isLightCell(cell: LocalCell): boolean {
  return CEILING_LIGHTS.some(
    (c) => c.x === cell.x && c.z === cell.z && c.layer === cell.layer,
  );
}

/** The doors whose plates stand in the room's inside layers, where the ceiling does not lay them (ADR 0121). */
function insidePlateDoors<Id extends string>(
  doors: readonly StorageDoor<Id>[],
): HingedStorageDoor<Id>[] {
  return doors.filter(
    (door): door is HingedStorageDoor<Id> =>
      door.opening.kind === "hinged" &&
      door.opening.plate.layer !== CEILING_LAYER,
  );
}

type CompartmentCell = DockCell & { readonly block: StorageCompartmentBlock };

/**
 * The block in each storage compartment, with the item at each end, its items drawn while its
 * door is in `shown`: open or still swinging shut (ADR 0114, 0121).
 */
export function compartmentCells(
  pose: HoldPose,
  decor: readonly DecorPlacement[],
  shown: ReadonlySet<string>,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): CompartmentCell[] {
  const face = decorFace(pose.yaw);
  return doors.map((door) => ({
    ...localCellAt(pose, door.compartment),
    block: door.unit.compartmentBlock({
      face,
      open: shown.has(door.id),
      height: door.slots[0]?.height ?? 0,
      ...pairItems({ cell: door.compartment }, decor),
    }),
  }));
}

/**
 * The plate of each door in `open` whose plate stands in the room's inside layers, on the side
 * of its cell where the door's hinge is. A plate in a ceiling light's cell is `lit` while
 * `lightsOn`, and ceilingLightCells leaves that cell to it. The ceiling lays the plates in the
 * ceiling layer (ADR 0115, 0121).
 */
export function storagePlateCells(
  pose: HoldPose,
  open: ReadonlySet<string>,
  lightsOn: boolean,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): DockCell[] {
  const { f } = axes(pose.yaw);
  return insidePlateDoors(doors)
    .filter(({ id }) => open.has(id))
    .map((door) => ({
      ...localCellAt(pose, door.opening.plate),
      block: door.unit.plateBlock({
        face: plateFace(door.opening, f),
        lit: lightsOn && isLightCell(door.opening.plate),
      }),
    }));
}

/**
 * The doors whose plates stand in the room's inside layers, with their plate cells at `pose`.
 * Parking checks those cells, and departure reads them with ownPlateBlock instead of as
 * cargo (ADR 0121).
 */
export function storagePlateChecks<Id extends string>(
  pose: HoldPose,
  doors: readonly StorageDoor<Id>[],
): { door: StorageDoor<Id>; cell: Vec3 }[] {
  return insidePlateDoors(doors).map((door) => ({
    door,
    cell: localCellAt(pose, door.opening.plate),
  }));
}

/**
 * An inside-layer plate cell lets the camper leave only while it holds air or `door`'s plate:
 * the plate goes when departure shuts the door (ADR 0121).
 */
export function ownPlateBlock(
  typeId: string | undefined,
  door: StorageDoor,
): boolean {
  return (
    typeId === AIR || typeId?.endsWith(`:${door.unit.plateBlockName}`) === true
  );
}

/**
 * The storage door a press on world `cell` reaches at `pose`: the door of the compartment
 * there, or the door whose plate the cell holds while it is open (ADR 0114, 0121).
 */
export function storagePressTarget<Id extends string>(
  pose: HoldPose,
  cell: Vec3,
  doors: readonly StorageDoor<Id>[],
): { door: StorageDoor<Id>; onCompartment: boolean } | undefined {
  const at = (local: LocalCell) => {
    const c = localCellAt(pose, local);
    return c.x === cell.x && c.y === cell.y && c.z === cell.z;
  };
  const door = doors.find(
    (d) =>
      at(d.compartment) || (d.opening.kind === "hinged" && at(d.opening.plate)),
  );
  return door && { door, onCompartment: at(door.compartment) };
}

/**
 * Cells where a player's block keeps the camper parked: the interior outside
 * furniture blocks, decor slots and storage plates, then the roof top (ADR 0092, 0093,
 * 0097, 0121). Slot cells are read separately, with ownSlotBlock, and storage plate cells
 * with ownPlateBlock.
 */
export function cargoCells(
  pose: HoldPose,
  doors: readonly StorageDoor[] = STORAGE_DOORS,
): Vec3[] {
  const read = new Set(
    [
      ...slotCells(pose),
      ...storagePlateChecks(pose, doors).map(({ cell }) => cell),
    ].map(cellKey),
  );
  return interior(pose, [...INSIDE_LAYERS, ROOF_LAYER]).filter(
    (c) => !read.has(cellKey(c)),
  );
}

/** Unknown cells (an unloaded chunk) count as holding a block. */
export function holdsCargo(types: readonly (string | undefined)[]): boolean {
  return types.some((t) => t !== AIR);
}
