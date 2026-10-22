// Connects game events to the use cases.
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { OpenGift } from "../../../application/vehicle/openGift";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type { PlaceDecor } from "../../../application/vehicle/placeDecor";
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { PressCabinet } from "../../../application/vehicle/pressCabinet";
import type { RemoveDecor } from "../../../application/vehicle/removeDecor";
import type { RunShower } from "../../../application/vehicle/runShower";
import type { SetDecor } from "../../../application/vehicle/setDecor";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SleepInBed } from "../../../application/vehicle/sleepInBed";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { UseDockDoor } from "../../../application/vehicle/useDockDoor";
import type { UseShowerDoor } from "../../../application/vehicle/useShowerDoor";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { TestInputStore } from "../testInput/testInputStore";
import { registerCabinet } from "./handlers/cabinet";
import { registerDecor } from "./handlers/decor";
import { registerDockBed } from "./handlers/dockBed";
import { registerDockDoor } from "./handlers/dockDoor";
import { registerDockGuard } from "./handlers/dockGuard";
import { registerDrive } from "./handlers/drive";
import { registerFleet } from "./handlers/fleet";
import { registerGifts } from "./handlers/gift";
import { registerHeadlights } from "./handlers/headlights";
import { registerHits } from "./handlers/hits";
import { registerPlacement } from "./handlers/placement";
import { registerShowerToilet } from "./handlers/showerToilet";
import { registerStarter } from "./handlers/starter";
import { registerTestDecor } from "./handlers/testDecor";
import { registerTestInput } from "./handlers/testInput";

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
    starter: GiveStarterVehicle;
    gift: OpenGift;
    hit: HitVehicle;
    limit: LimitVehicles;
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
    door: UseDockDoor;
    bed: SleepInBed;
    showerDoor: UseShowerDoor;
    shower: RunShower;
    decor: SetDecor;
    placeDecor: PlaceDecor;
    removeDecor: RemoveDecor;
    cabinet: PressCabinet;
    hints: ShowVehicleHints;
  },
  testInputs: TestInputStore,
  dockDoorOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  dockBlockOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
    typeId: string,
  ) => VehicleId | undefined,
): void {
  registerDecor(useCases.placeDecor, useCases.removeDecor, dockCellOwner);
  registerDockBed(useCases.bed);
  registerDockDoor(useCases.door, dockDoorOwner);
  registerDockGuard(dockBlockOwner);
  registerShowerToilet(useCases.showerDoor, useCases.shower, dockCellOwner);
  registerCabinet(useCases.cabinet, dockCellOwner);
  registerDrive(useCases.drive, useCases.hints);
  registerFleet(useCases.limit);
  registerTestDecor(useCases.decor);
  registerTestInput(testInputs);
  registerGifts(useCases.gift);
  registerPlacement(useCases.place);
  registerStarter(useCases.starter);
  registerHits(useCases.hit, useCases.paint);
  registerHeadlights(useCases.headlights);
}
