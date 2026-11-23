import type { installResort } from "../install";
import { registerTestBeachChair } from "./testBeachChair";
import { registerTestFurniture } from "./testFurniture";
import { registerTestParasol } from "./testParasol";
import { registerTestToilet } from "./testToilet";
import { registerTestWashstand } from "./testWashstand";

export function installResortTestHooks(
  parts: ReturnType<typeof installResort>,
): void {
  registerTestFurniture(parts.furniture, parts.takeFurniture, parts.deps);
  registerTestToilet(parts.states, parts.sound, parts.deps);
  registerTestWashstand(parts.washstand, parts.useWashstand);
  registerTestBeachChair(parts.chair, parts.takeChair, parts.deps, parts.form);
  registerTestParasol(parts.parasol, parts.takeBackParasol, parts.deps);
}
