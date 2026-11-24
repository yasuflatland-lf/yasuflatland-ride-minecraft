import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { registerTestHeldItem } from "./testHeldItem";
import { registerTestTool } from "./testTool";

export interface VehicleTestHookParts {
  repo: VehicleRepository;
  registerKindTestHooks: () => void;
  testHeldItems: VehicleTestStore<string>;
}

export function installVehicleTestHooks(parts: VehicleTestHookParts): void {
  parts.registerKindTestHooks();
  registerTestTool(parts.repo);
  registerTestHeldItem(parts.testHeldItems);
}
