// Connects game events to the use cases.

import type { BoardVehicle } from "../../../application/vehicle/boardVehicle";
import type { DriveVehicles } from "../../../application/vehicle/driveVehicles";
import type { HitVehicle } from "../../../application/vehicle/hitVehicle";
import type { LimitVehicles } from "../../../application/vehicle/limitVehicles";
import type { OpenGift } from "../../../application/vehicle/openGift";
import type { OpenNav } from "../../../application/vehicle/openNav";
import type { PaintVehicle } from "../../../application/vehicle/paintVehicle";
import type { PlaceVehicle } from "../../../application/vehicle/placeVehicle";
import type { SwitchCeilingLights } from "../../../application/vehicle/room/switchCeilingLights";
import type { ScanForPlaces } from "../../../application/vehicle/scanForPlaces";
import type { ShowVehicleHints } from "../../../application/vehicle/showVehicleHints";
import type { SwitchBoost } from "../../../application/vehicle/switchBoost";
import type { SwitchEquipment } from "../../../application/vehicle/switchEquipment";
import type { SwitchHeadlights } from "../../../application/vehicle/switchHeadlights";
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
import { boosterSwitchTarget } from "./handlers/boosterSwitch";
import { registerDrive } from "./handlers/drive";
import { equipmentSwitchTarget } from "./handlers/equipmentSwitch";
import { registerFleet } from "./handlers/fleet";
import { registerGifts } from "./handlers/gift";
import { vehicleSwitchTarget } from "./handlers/headlights";
import { registerHits } from "./handlers/hits";
import { navSwitchTarget } from "./handlers/navSwitch";
import { registerPlacement } from "./handlers/placement";
import { registerStandIns } from "./handlers/standIn";
import { registerTestInput } from "./handlers/testInput";
import { BOOSTER_TYPE, EQUIPMENT_SWITCH_TYPES, NAV_TYPE } from "./identifiers";

export function registerSubscriptions(
  useCases: {
    drive: DriveVehicles;
    place: PlaceVehicle;
    gift: OpenGift;
    hit: HitVehicle;
    limit: LimitVehicles;
    paint: PaintVehicle;
    headlights: SwitchHeadlights;
    ceilingLights: SwitchCeilingLights;
    equipment: SwitchEquipment;
    boost: SwitchBoost;
    nav: OpenNav;
    hints: ShowVehicleHints;
    radar: ScanForPlaces;
    board: BoardVehicle;
  },
  testInputs: VehicleTestStore<RawInput>,
  dockCellOwner: (
    dimensionId: DimensionId,
    cell: Vec3,
  ) => VehicleId | undefined,
  installKind: () => void,
  /** Other features' switch targets, asked after the vehicle's; read on every press. */
  laterSwitchTargets: () => readonly SwitchTarget[],
): void {
  installKind();
  registerDrive(useCases.drive, useCases.hints, useCases.radar);
  registerFleet(useCases.limit);
  registerTestInput(testInputs);
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
  const equipment = equipmentSwitchTarget(useCases.equipment);
  const booster = boosterSwitchTarget(useCases.boost);
  const nav = navSwitchTarget(useCases.nav);
  const switchRoutes: SwitchRoutes = {
    [HEADLIGHT_SWITCH_TYPE]: () => [vehicle, ...laterSwitchTargets()],
    [BOOSTER_TYPE]: () => [booster],
    [NAV_TYPE]: () => [nav],
    ...Object.fromEntries(
      EQUIPMENT_SWITCH_TYPES.map((type) => [type, () => [equipment]]),
    ),
  };
  registerSwitchRouter(switchRoutes);
  registerPlacement(useCases.place);
  registerHits(useCases.hit, useCases.paint);
}
