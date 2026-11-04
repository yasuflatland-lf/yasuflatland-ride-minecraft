// Connects game events to the use cases.

import type { BoardVehicle } from "../../../application/vehicle/boardVehicle";
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { GiveStarterVehicle } from "../../../application/vehicle/giveStarterVehicle";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { OpenGift } from "../../../application/vehicle/openGift";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { SetDecor } from "../../../application/vehicle/setDecor";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SwitchCeilingLights } from "../../../application/vehicle/switchCeilingLights";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
import type { SwitchTool } from "../../../application/vehicle/switchTool";
import type { DimensionId, VehicleId } from "../../../domain/shared/ids";
import type { Vec3 } from "../../../domain/shared/vec";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import { HEADLIGHT_SWITCH_TYPE } from "../../shared/identifiers";
import {
  registerSwitchRouter,
  type SwitchRoutes,
  type SwitchTarget,
} from "../../shared/switchRouter";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { registerBoarding } from "./handlers/boarding";
import { registerDrive } from "./handlers/drive";
import { registerFleet } from "./handlers/fleet";
import { registerGifts } from "./handlers/gift";
import { vehicleSwitchTarget } from "./handlers/headlights";
import { registerHits } from "./handlers/hits";
import { registerPlacement } from "./handlers/placement";
import { registerStandIns } from "./handlers/standIn";
import { registerStarter } from "./handlers/starter";
import { registerTestDecor } from "./handlers/testDecor";
import { registerTestHeldItem } from "./handlers/testHeldItem";
import { registerTestInput } from "./handlers/testInput";
import { registerTestTool } from "./handlers/testTool";
import { toolSwitchTarget } from "./handlers/toolSwitch";
import { MONITOR_TOOL_TYPES } from "./identifiers";

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
    tool: SwitchTool;
    decor: SetDecor;
    hints: ShowVehicleHints;
    board: BoardVehicle;
  },
  testInputs: VehicleTestStore<RawInput>,
  testHeldItems: VehicleTestStore<string>,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  installKind: () => void,
  /** Other features' switch targets, asked after the vehicle's; read on every press. */
  laterSwitchTargets: () => readonly SwitchTarget[],
): void {
  installKind();
  registerDrive(useCases.drive, useCases.hints);
  registerFleet(useCases.limit);
  registerTestTool(useCases.tool);
  registerTestDecor(useCases.decor);
  registerTestInput(testInputs);
  registerTestHeldItem(testHeldItems);
  registerGifts(useCases.gift);
  registerBoarding(useCases.board);
  registerStandIns(useCases.board);
  // The switch router subscribes before placement so placement's block press handler stays
  // the last one subscribed; each handler ignores the other's items (ADR 0115).
  const vehicle = vehicleSwitchTarget(
    useCases.headlights,
    useCases.ceilingLights,
    dockCellOwner,
  );
  const tool = toolSwitchTarget(useCases.tool);
  const switchRoutes: SwitchRoutes = {
    [HEADLIGHT_SWITCH_TYPE]: () => [vehicle, ...laterSwitchTargets()],
    ...Object.fromEntries(
      MONITOR_TOOL_TYPES.map((type) => [type, () => [tool]]),
    ),
  };
  registerSwitchRouter(switchRoutes);
  registerPlacement(useCases.place);
  registerStarter(useCases.starter);
  registerHits(useCases.hit, useCases.paint);
}
