import type { VehicleRepository } from "../../../domain/vehicle/vehicleRepository";
import type { VehicleTestStore } from "../testInput/vehicleTestStore";
import { registerTestBoost } from "./testBoost";
import { registerTestBoostCrew } from "./testBoostCrew";
import { registerTestEquipment } from "./testEquipment";
import { registerTestHeldItem } from "./testHeldItem";

export interface VehicleTestHookParts {
  repo: VehicleRepository;
  registerKindTestHooks: () => void;
  testHeldItems: VehicleTestStore<string>;
}

export function installVehicleTestHooks(parts: VehicleTestHookParts): void {
  parts.registerKindTestHooks();
  registerTestBoost(parts.repo);
  registerTestBoostCrew(parts.repo);
  registerTestEquipment(parts.repo);
  registerTestHeldItem(parts.testHeldItems);
}
