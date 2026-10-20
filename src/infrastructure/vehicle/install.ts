// Wires the vehicle feature's repositories, port implementations, and use cases
// together.
import { DriveVehicles } from "../../application/vehicle/driveVehicles";
import { GiveStarterVehicle } from "../../application/vehicle/giveStarterVehicle";
import { HitVehicle } from "../../application/vehicle/hitVehicle";
import { LimitVehicles } from "../../application/vehicle/limitVehicles";
import { PaintVehicle } from "../../application/vehicle/paintVehicle";
import { PlaceVehicle } from "../../application/vehicle/placeVehicle";
import { ShowVehicleHints } from "../../application/vehicle/showVehicleHints";
import { SwitchHeadlights } from "../../application/vehicle/switchHeadlights";
import { UseDockDoor } from "../../application/vehicle/useDockDoor";
import { fleetLimitOf } from "../../domain/vehicle/kinds/index";
import { NAMESPACE } from "../shared/identifiers";
import { BedrockHeadlightWorld } from "./bedrock/bedrockHeadlightWorld";
import { BedrockHintWorld } from "./bedrock/bedrockHintWorld";
import { BedrockInventory } from "./bedrock/bedrockInventory";
import { BedrockPaintWorld } from "./bedrock/bedrockPaintWorld";
import { BedrockPlacementWorld } from "./bedrock/bedrockPlacementWorld";
import { BedrockVehicleWorld } from "./bedrock/bedrockVehicleWorld";
import { EntityIndex } from "./bedrock/entityIndex";
import { registerSubscriptions } from "./bedrock/subscriptions";
import { DynamicPropertyFleetRepository } from "./persistence/dynamicPropertyFleetRepository";
import { InMemoryVehicleRepository } from "./persistence/inMemoryVehicleRepository";
import { TestInputStore } from "./testInput/testInputStore";

export function installVehicles(): void {
  const repo = new InMemoryVehicleRepository();
  const store = new TestInputStore();
  const index = new EntityIndex();
  const inventory = new BedrockInventory(index);
  const bedrock = new BedrockVehicleWorld(index, store);
  const log = { warn: (m: string) => console.warn(`[${NAMESPACE}] ${m}`) };
  const fleets = new DynamicPropertyFleetRepository(log, fleetLimitOf);
  registerSubscriptions(
    {
      drive: new DriveVehicles(bedrock, repo, log),
      place: new PlaceVehicle(new BedrockPlacementWorld(inventory), repo),
      starter: new GiveStarterVehicle(inventory),
      hit: new HitVehicle(bedrock, repo, fleets),
      limit: new LimitVehicles(bedrock, repo, fleets, log),
      paint: new PaintVehicle(new BedrockPaintWorld(index, inventory)),
      headlights: new SwitchHeadlights(new BedrockHeadlightWorld(index), repo),
      door: new UseDockDoor(repo),
      hints: new ShowVehicleHints(new BedrockHintWorld(index), repo),
    },
    store,
    (dimensionId, cell) => bedrock.dockDoorOwner(dimensionId, cell),
  );
}
