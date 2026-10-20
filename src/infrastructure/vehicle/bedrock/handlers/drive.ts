import { system } from "@minecraft/server";
import type { DriveVehicles } from "../../../../application/vehicle/driveVehicles";
import type { ShowVehicleHints } from "../../../../application/vehicle/showVehicleHints";
import { SPEC } from "../../../../domain/vehicle/spec";

export function registerDrive(
  drive: DriveVehicles,
  hints: ShowVehicleHints,
): void {
  system.runInterval(() => drive.execute(system.currentTick), 1);
  // Registered after the drive, so on the ticks both run the hints read this
  // tick's parked state and the vehicles the drive just indexed (ADR 0086).
  system.runInterval(() => hints.execute(), SPEC.hintCheckInterval);
}
