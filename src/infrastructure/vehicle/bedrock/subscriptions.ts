// Connects game events to the use cases.
import type { BoardVehicle } from "../../../application/vehicle/boardVehicle";
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { OpenGift } from "../../../application/vehicle/openGift";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type { PlaceDecor } from "../../../application/vehicle/placeDecor";
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { PressShowerToilet } from "../../../application/vehicle/pressShowerToilet";
import type { PressStorage } from "../../../application/vehicle/pressStorage";
import type { RemoveDecor } from "../../../application/vehicle/removeDecor";
import type { SetDecor } from "../../../application/vehicle/setDecor";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SleepInBed } from "../../../application/vehicle/sleepInBed";
import type { SwitchCeilingLights } from "../../../application/vehicle/switchCeilingLights";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { UseDockDoor } from "../../../application/vehicle/useDockDoor";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { TestInputStore } from "../testInput/testInputStore";
import { registerBoarding } from "./handlers/boarding";
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
import { registerStandIns } from "./handlers/standIn";
import { registerStarter } from "./handlers/starter";
import { registerStorage } from "./handlers/storage";
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
    ceilingLights: SwitchCeilingLights;
    door: UseDockDoor;
    bed: SleepInBed;
    showerToilet: PressShowerToilet;
    decor: SetDecor;
    placeDecor: PlaceDecor;
    removeDecor: RemoveDecor;
    storage: PressStorage;
    hints: ShowVehicleHints;
    board: BoardVehicle;
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
  registerShowerToilet(useCases.showerToilet, dockCellOwner);
  registerStorage(useCases.storage, dockCellOwner);
  registerDrive(useCases.drive, useCases.hints);
  registerFleet(useCases.limit);
  registerTestDecor(useCases.decor);
  registerTestInput(testInputs);
  registerGifts(useCases.gift);
  registerBoarding(useCases.board);
  registerStandIns();
  // Subscribed before placement, so placement's block press handler stays the last one
  // subscribed; each handler ignores the other's items (ADR 0115).
  registerHeadlights(
    useCases.headlights,
    useCases.ceilingLights,
    dockCellOwner,
  );
  registerPlacement(useCases.place);
  registerStarter(useCases.starter);
  registerHits(useCases.hit, useCases.paint);
}
