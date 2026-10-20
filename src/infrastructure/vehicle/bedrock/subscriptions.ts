// Connects game events to the use cases.
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { UseDockDoor } from "../../../application/vehicle/useDockDoor";
import type { VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { TestInputStore } from "../testInput/testInputStore";
import { registerDockDoor } from "./handlers/dockDoor";
import { registerDrive } from "./handlers/drive";
import { registerFleet } from "./handlers/fleet";
import { registerHeadlights } from "./handlers/headlights";
import { registerHits } from "./handlers/hits";
import { registerPlacement } from "./handlers/placement";
import { registerStarter } from "./handlers/starter";
import { registerTestInput } from "./handlers/testInput";

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
    starter: GiveStarterVehicle;
    hit: HitVehicle;
    limit: LimitVehicles;
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
    door: UseDockDoor;
    hints: ShowVehicleHints;
  },
  testInputs: TestInputStore,
  dockDoorOwner: (dimensionId: string, cell: Vec3) => VehicleId | undefined,
): void {
  registerDockDoor(useCases.door, dockDoorOwner);
  registerDrive(useCases.drive, useCases.hints);
  registerFleet(useCases.limit);
  registerTestInput(testInputs);
  registerPlacement(useCases.place);
  registerStarter(useCases.starter);
  registerHits(useCases.hit, useCases.paint);
  registerHeadlights(useCases.headlights);
}
