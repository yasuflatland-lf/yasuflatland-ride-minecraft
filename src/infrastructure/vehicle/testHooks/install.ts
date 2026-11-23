import type { DecorWorld } from "../../../application/vehicle/ports/decor";
import { SetDecor } from "../../../application/vehicle/room/setDecor";
import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { registerTestDecor } from "./testDecor";
import { registerTestHeldItem } from "./testHeldItem";
import { registerTestTool } from "./testTool";

export interface VehicleTestHookParts {
  repo: VehicleRepository;
  decorWorld: DecorWorld;
  testHeldItems: VehicleTestStore<string>;
}

export function installVehicleTestHooks(parts: VehicleTestHookParts): void {
  registerTestDecor(new SetDecor(parts.decorWorld, parts.repo));
  registerTestTool(parts.repo);
  registerTestHeldItem(parts.testHeldItems);
}
