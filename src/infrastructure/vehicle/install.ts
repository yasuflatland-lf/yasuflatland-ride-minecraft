// Wires the vehicle feature's repositories, port implementations, and use cases
// together.
import { DriveVehicles } from "../../application/vehicle/driveVehicles";
import { GiveStarterVehicle } from "../../application/vehicle/giveStarterVehicle";
import { HitVehicle } from "../../application/vehicle/hitVehicle";
import { LimitVehicles } from "../../application/vehicle/limitVehicles";
import { OpenGift } from "../../application/vehicle/openGift";
import { PaintVehicle } from "../../application/vehicle/paintVehicle";
import { PlaceDecor } from "../../application/vehicle/placeDecor";
import { PlaceVehicle } from "../../application/vehicle/placeVehicle";
import { PressCabinet } from "../../application/vehicle/pressCabinet";
import { PressShowerToilet } from "../../application/vehicle/pressShowerToilet";
import { RemoveDecor } from "../../application/vehicle/removeDecor";
import { SetDecor } from "../../application/vehicle/setDecor";
import { ShowVehicleHints } from "../../application/vehicle/showVehicleHints";
import { SleepInBed } from "../../application/vehicle/sleepInBed";
import { SwitchCeilingLights } from "../../application/vehicle/switchCeilingLights";
import { SwitchHeadlights } from "../../application/vehicle/switchHeadlights";
import { UseDockDoor } from "../../application/vehicle/useDockDoor";
import { fleetLimitOf } from "../../domain/vehicle/kinds/index";
import { NAMESPACE } from "../shared/identifiers";
import { BedrockBedWorld } from "./bedrock/bedrockBedWorld";
import { BedrockDecorWorld } from "./bedrock/bedrockDecorWorld";
import { BedrockFleetWorld } from "./bedrock/bedrockFleetWorld";
import { BedrockHeadlightWorld } from "./bedrock/bedrockHeadlightWorld";
import { BedrockHintWorld } from "./bedrock/bedrockHintWorld";
import { BedrockInventory } from "./bedrock/bedrockInventory";
import { BedrockPaintWorld } from "./bedrock/bedrockPaintWorld";
import { BedrockPlacementWorld } from "./bedrock/bedrockPlacementWorld";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { EntityIndex } from "./bedrock/entityIndex";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { systemClock } from "./bedrock/systemClock";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { TestInputStore } from "./testInput/testInputStore";

export function installVehicles(): void {
  const repo = new InMemoryVehicleRepository();
  const store = new TestInputStore();
  const index = new EntityIndex();
  const inventory = new BedrockInventory(index);
  const decorWorld = new BedrockDecorWorld(index, inventory);
  const bedrock = new BedrockVehicleWorld(index, store);
  const fleetWorld = new BedrockFleetWorld(index, bedrock.releaser, inventory);
  const log = { warn: (m: string) => console.warn(`[${NAMESPACE}] ${m}`) };
  const fleets = new DynamicPropertyFleetRepository(log, fleetLimitOf);
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log),
      place: new PlaceVehicle(
        new BedrockPlacementWorld(inventory, index),
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
      door: new UseDockDoor(repo, systemClock),
      bed: new SleepInBed(new BedrockBedWorld(index)),
      showerToilet: new PressShowerToilet(repo, systemClock),
      decor: new SetDecor(decorWorld, repo),
      placeDecor: new PlaceDecor(decorWorld, repo),
      removeDecor: new RemoveDecor(decorWorld, repo),
      cabinet: new PressCabinet(decorWorld, repo, systemClock),
      hints: new ShowVehicleHints(
        new BedrockHintWorld(index),
        repo,
        systemClock,
      ),
    },
    store,
    (dimensionId, cell) => bedrock.dockDoorOwner(dimensionId, cell),
    (dimensionId, cell) => bedrock.dockCellOwner(dimensionId, cell),
    (dimensionId, cell, typeId) =>
      bedrock.dockBlockOwner(dimensionId, cell, typeId),
  );
}
