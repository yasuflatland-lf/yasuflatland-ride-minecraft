import type { SleepInBed } from "../../../../application/shared/sleepInBed";
import type { FindBedSpawnCell } from "../../../../application/vehicle/findBedSpawnCell";
import type { NormalizePaint } from "../../../../application/vehicle/normalizePaint";
import type { PlaceDecor } from "../../../../application/vehicle/placeDecor";
import type { PressShowerToilet } from "../../../../application/vehicle/pressShowerToilet";
import type { PressStorage } from "../../../../application/vehicle/pressStorage";
import type { RemoveDecor } from "../../../../application/vehicle/removeDecor";
import type { UseDockDoor } from "../../../../application/vehicle/useDockDoor";
import type { DimensionId, VehicleId } from "../../../../domain/shared/ids";
import type { Vec3 } from "../../../../domain/shared/vec";
import { registerBedBlock } from "../../../shared/bedBlock";
import { registerDecor } from "./handlers/decor";
import { registerDockDoor } from "./handlers/dockDoor";
import { registerNormalizePaint } from "./handlers/normalizePaint";
import { registerShowerToilet } from "./handlers/showerToilet";
import { registerStorage } from "./handlers/storage";
import { CAMPER_BED_COMPONENT } from "./identifiers";

export function installCamper(
  useCases: {
    normalizePaint: NormalizePaint;
    door: UseDockDoor;
    bed: SleepInBed;
    bedSpawnCell: FindBedSpawnCell;
    showerToilet: PressShowerToilet;
    placeDecor: PlaceDecor;
    removeDecor: RemoveDecor;
    storage: PressStorage;
  },
  dockDoorOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  registerDockGuard: () => void,
): void {
  registerNormalizePaint(useCases.normalizePaint);
  registerDecor(
    useCases.placeDecor,
    useCases.removeDecor,
    dockCellOwner,
    useCases.storage,
  );
  registerBedBlock(CAMPER_BED_COMPONENT, useCases.bed, (dim, cell) => {
    const id = dockCellOwner(dim, cell);
    return id === undefined
      ? undefined
      : useCases.bedSpawnCell.execute({ vehicleId: id, cell });
  });
  registerDockDoor(useCases.door, dockDoorOwner);
  registerDockGuard();
  registerShowerToilet(useCases.showerToilet, dockCellOwner);
  registerStorage(useCases.storage, dockCellOwner);
}
