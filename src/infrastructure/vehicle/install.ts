// Wires the vehicle feature's repositories, port implementations, and use cases
// together.

import { system } from "@minecraft/server";
import { GiveStarterItem } from "../../application/shared/giveStarterItem";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../application/shared/ports/vehicleHost";
import { BoardVehicle } from "../../application/vehicle/boardVehicle";
import { DriveVehicles } from "../../application/vehicle/driveVehicles";
import { HitVehicle } from "../../application/vehicle/hitVehicle";
import { LimitVehicles } from "../../application/vehicle/limitVehicles";
import { OpenGift } from "../../application/vehicle/openGift";
import { PaintVehicle } from "../../application/vehicle/paintVehicle";
import { PlaceVehicle } from "../../application/vehicle/placeVehicle";
import { RiderEffects } from "../../application/vehicle/riderEffects";
import { ScanForPlaces } from "../../application/vehicle/scanForPlaces";
import { ShowVehicleHints } from "../../application/vehicle/showVehicleHints";
import { SwitchBoost } from "../../application/vehicle/switchBoost";
import { SwitchEquipment } from "../../application/vehicle/switchEquipment";
import { SwitchFeedback } from "../../application/vehicle/switchFeedback";
import { SwitchHeadlights } from "../../application/vehicle/switchHeadlights";
import type { RawInput } from "../../domain/vehicle/driveInput";
import { fleetLimitOf } from "../../domain/vehicle/kinds/index";
import { STARTER_KINDS } from "../../domain/vehicle/placement/starter";
import { consoleLogger as log } from "../shared/consoleLogger";
import { id } from "../shared/identifiers";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import type { SwitchTarget } from "../shared/switchRouter";
import { ActionBarLog } from "./bedrock/actionBarLog";
import { BedrockFleetWorld } from "./bedrock/bedrockFleetWorld";
import { BedrockHeadlightWorld } from "./bedrock/bedrockHeadlightWorld";
import { BedrockHintWorld } from "./bedrock/bedrockHintWorld";
import { BedrockInventory } from "./bedrock/bedrockInventory";
import { BedrockPaintWorld } from "./bedrock/bedrockPaintWorld";
import { BedrockPlacementWorld } from "./bedrock/bedrockPlacementWorld";
import { BedrockRadarWorld } from "./bedrock/bedrockRadarWorld";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import {
  composeDockCodec,
  DECK_CODEC,
  DockBlocks,
  LIGHT_CODEC,
} from "./bedrock/dockBlocks";
import { EntityIndex } from "./bedrock/entityIndex";
import { registerCutDrops } from "./bedrock/handlers/cutDrops";
import { registerDockGuard } from "./bedrock/handlers/dockGuard";
import {
  ITEM_TYPE,
  isFleetEntityType,
  STARTER_RECEIVED_PROPERTY,
} from "./bedrock/identifiers";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { systemClock } from "./bedrock/systemClock";
import { CAMPER_ROOM_CODEC } from "./kinds/camper/dockBlocks";
import { isStandableRoomBlock } from "./kinds/camper/identifiers";
import { installCamper } from "./kinds/camper/install";
import { readCamperRestored } from "./kinds/camper/restored";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import type { VehicleTestHookParts } from "./testHooks/install";
import { VehicleTestStore } from "./testInput/vehicleTestStore";

/**
 * Installs the vehicle feature. The returned check lets bootstrap hand other
 * features the vehicles' space without them importing this feature. Camp's check
 * comes through bootstrap too, along with the switch targets of
 * other features, which the switch router asks after the vehicle's (ADR 0046, 0122, 0129).
 */
export function installVehicles(deps: {
  isCampSpace: SpaceCheck;
  laterSwitchTargets: () => readonly SwitchTarget[];
}): {
  isVehicleSpace: SpaceCheck;
  vehicleHost: VehicleHostLookup;
  testHooks: VehicleTestHookParts;
  isFleetEntityType: (typeId: string) => boolean;
} {
  const repo = new InMemoryVehicleRepository();
  const testInputs = new VehicleTestStore<RawInput>();
  const testHeldItems = new VehicleTestStore<string>();
  const index = new EntityIndex();
  const actionBar = new ActionBarLog(index, () => system.currentTick);
  const inventory = new BedrockInventory(index);
  const dockCodec = composeDockCodec({
    ...DECK_CODEC,
    ...LIGHT_CODEC,
    ...CAMPER_ROOM_CODEC,
  });
  const docks = new DockBlocks(deps.isCampSpace, dockCodec);
  const bedrock = new BedrockVehicleWorld(
    index,
    testInputs,
    testHeldItems,
    deps.isCampSpace,
    docks,
    {
      camper: (vehicle) => readCamperRestored(vehicle, docks.restore(vehicle)),
    },
    isStandableRoomBlock,
    actionBar,
  );
  const fleetWorld = new BedrockFleetWorld(
    index,
    bedrock.releaser,
    inventory,
    id,
  );
  const fleets = new DynamicPropertyFleetRepository(log, fleetLimitOf);
  const riders = new RiderEffects(bedrock, log);
  const feedback = new SwitchFeedback(bedrock, riders);
  const camper = installCamper(
    { repo, index, inventory, clock: systemClock, actionBar },
    (dimensionId, cell) => bedrock.dockDoorOwner(dimensionId, cell),
    (dimensionId, cell) => bedrock.dockCellOwner(dimensionId, cell),
    () =>
      registerDockGuard((dimensionId, cell, typeId) =>
        bedrock.dockBlockOwner(dimensionId, cell, typeId),
      ),
  );
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log, riders),
      place: new PlaceVehicle(
        new BedrockPlacementWorld(inventory, index, deps.isCampSpace),
        repo,
        log,
      ),
      gift: new OpenGift(inventory),
      hit: new HitVehicle(fleetWorld, repo, fleets, systemClock),
      limit: new LimitVehicles(fleetWorld, repo, fleets, log),
      paint: new PaintVehicle(
        new BedrockPaintWorld(index, inventory),
        systemClock,
      ),
      headlights: new SwitchHeadlights(
        new BedrockHeadlightWorld(index),
        repo,
        systemClock,
        feedback,
      ),
      ceilingLights: camper.ceilingLights,
      equipment: new SwitchEquipment(repo, systemClock, feedback),
      boost: new SwitchBoost(repo, systemClock, feedback, bedrock),
      hints: new ShowVehicleHints(
        new BedrockHintWorld(index, actionBar),
        repo,
        systemClock,
      ),
      radar: new ScanForPlaces(new BedrockRadarWorld(index, actionBar), repo),
      board: new BoardVehicle(repo),
    },
    testInputs,
    (dimensionId, cell) => bedrock.dockCellOwner(dimensionId, cell),
    camper.registerHandlers,
    deps.laterSwitchTargets,
  );
  registerCutDrops((entity) => bedrock.sweepCutDrop(entity));
  for (const kind of STARTER_KINDS) {
    registerStarterItem(
      new GiveStarterItem(
        new BedrockStarterItemWorld(
          ITEM_TYPE[kind],
          STARTER_RECEIVED_PROPERTY[kind],
        ),
        { skipCreative: false },
      ),
    );
  }
  return {
    isFleetEntityType,
    testHooks: {
      repo,
      index,
      registerKindTestHooks: camper.registerTestHooks,
      testHeldItems,
    },
    vehicleHost: (vehicleId) => bedrock.hostState(vehicleId),
    isVehicleSpace: (dimensionId, cell) =>
      bedrock.isVehicleSpace(dimensionId, cell),
  };
}
