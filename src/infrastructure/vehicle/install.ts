// Wires the vehicle feature's repositories, port implementations, and use cases
// together.

import type { SpaceCheck } from "../../application/shared/ports/space";
import { SleepInBed } from "../../application/shared/sleepInBed";
import { BoardVehicle } from "../../application/vehicle/boardVehicle";
import { DriveVehicles } from "../../application/vehicle/driveVehicles";
import { GiveStarterVehicle } from "../../application/vehicle/giveStarterVehicle";
import { HitVehicle } from "../../application/vehicle/hitVehicle";
import { LimitVehicles } from "../../application/vehicle/limitVehicles";
import { OpenGift } from "../../application/vehicle/openGift";
import { PaintVehicle } from "../../application/vehicle/paintVehicle";
import { PlaceDecor } from "../../application/vehicle/placeDecor";
import { PlaceVehicle } from "../../application/vehicle/placeVehicle";
import { PressShowerToilet } from "../../application/vehicle/pressShowerToilet";
import { PressStorage } from "../../application/vehicle/pressStorage";
import { RemoveDecor } from "../../application/vehicle/removeDecor";
import { SetDecor } from "../../application/vehicle/setDecor";
import { ShowVehicleHints } from "../../application/vehicle/showVehicleHints";
import { SwitchBlade } from "../../application/vehicle/switchBlade";
import { SwitchCeilingLights } from "../../application/vehicle/switchCeilingLights";
import { SwitchHeadlights } from "../../application/vehicle/switchHeadlights";
import { UseDockDoor } from "../../application/vehicle/useDockDoor";
import type { RawInput } from "../../domain/vehicle/driveInput";
import { fleetLimitOf } from "../../domain/vehicle/kinds/index";
import { BedrockBedWorld } from "../shared/bedrockBedWorld";
import { NAMESPACE } from "../shared/identifiers";
import type { SwitchTarget } from "../shared/switchRouter";
import { BedrockDecorWorld } from "./bedrock/bedrockDecorWorld";
import { BedrockFleetWorld } from "./bedrock/bedrockFleetWorld";
import { BedrockHeadlightWorld } from "./bedrock/bedrockHeadlightWorld";
import { BedrockHintWorld } from "./bedrock/bedrockHintWorld";
import { BedrockInventory } from "./bedrock/bedrockInventory";
import { BedrockPaintWorld } from "./bedrock/bedrockPaintWorld";
import { BedrockPlacementWorld } from "./bedrock/bedrockPlacementWorld";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { EntityIndex } from "./bedrock/entityIndex";
import { registerCutDrops } from "./bedrock/handlers/cutDrops";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { systemClock } from "./bedrock/systemClock";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { VehicleTestStore } from "./testInput/vehicleTestStore";

/**
 * Installs the vehicle feature. The returned check lets bootstrap hand other
 * features the vehicles' space without them importing this feature. Camp's check
 * comes through bootstrap too, and so do the switch targets of other features,
 * which the switch router asks after the vehicle's (ADR 0046, 0122, 0129).
 */
export function installVehicles(deps: {
  isCampSpace: SpaceCheck;
  laterSwitchTargets: () => readonly SwitchTarget[];
}): {
  isVehicleSpace: SpaceCheck;
} {
  const repo = new InMemoryVehicleRepository();
  const testInputs = new VehicleTestStore<RawInput>();
  const testTools = new VehicleTestStore<string>();
  const index = new EntityIndex();
  const inventory = new BedrockInventory(index);
  const decorWorld = new BedrockDecorWorld(index, inventory);
  const bedrock = new BedrockVehicleWorld(
    index,
    testInputs,
    testTools,
    deps.isCampSpace,
  );
  const fleetWorld = new BedrockFleetWorld(index, bedrock.releaser, inventory);
  const log = { warn: (m: string) => console.warn(`[${NAMESPACE}] ${m}`) };
  const fleets = new DynamicPropertyFleetRepository(log, fleetLimitOf);
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log),
      place: new PlaceVehicle(
        new BedrockPlacementWorld(inventory, index, deps.isCampSpace),
        repo,
      ),
      starter: new GiveStarterVehicle(inventory),
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
      ),
      ceilingLights: new SwitchCeilingLights(repo, systemClock),
      blade: new SwitchBlade(repo, systemClock),
      door: new UseDockDoor(repo, systemClock),
      bed: new SleepInBed(new BedrockBedWorld(index)),
      showerToilet: new PressShowerToilet(repo, systemClock),
      decor: new SetDecor(decorWorld, repo),
      placeDecor: new PlaceDecor(decorWorld, repo),
      removeDecor: new RemoveDecor(decorWorld, repo),
      storage: new PressStorage(decorWorld, repo, systemClock),
      hints: new ShowVehicleHints(
        new BedrockHintWorld(index),
        repo,
        systemClock,
      ),
      board: new BoardVehicle(repo),
    },
    testInputs,
    testTools,
    (dimensionId, cell) => bedrock.dockDoorOwner(dimensionId, cell),
    (dimensionId, cell) => bedrock.dockCellOwner(dimensionId, cell),
    (dimensionId, cell, typeId) =>
      bedrock.dockBlockOwner(dimensionId, cell, typeId),
    deps.laterSwitchTargets,
  );
  registerCutDrops((entity) => bedrock.sweepCutDrop(entity));
  return {
    isVehicleSpace: (dimensionId, cell) =>
      bedrock.isVehicleSpace(dimensionId, cell),
  };
}
