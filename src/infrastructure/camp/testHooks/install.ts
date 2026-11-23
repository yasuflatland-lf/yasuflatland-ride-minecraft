import type { installCamp } from "../install";
import { registerTestChairHit } from "./chairHit";
import { registerTestDutchOven } from "./dutchOven";
import { registerTestFirePit } from "./firePit";
import { registerTestGasLantern } from "./gasLantern";
import { registerTestRoofTent } from "./roofTent";
import { registerTestTable } from "./table";
import { registerTestTent } from "./tent";
import { registerTestTentFlap } from "./tentFlap";
import { registerTestTentLantern } from "./tentLantern";

export function installCampTestHooks({
  gear,
  tent,
  roof,
}: ReturnType<typeof installCamp>): void {
  registerTestChairHit(gear.hitChair);
  registerTestTable(gear.hitTable);
  registerTestDutchOven(gear.dutchOvens, gear.topHosts);
  registerTestFirePit(gear.firePits);
  registerTestGasLantern(gear.gasLanterns, gear.topHosts);
  registerTestTent(
    tent.pitchTent,
    tent.takeDownTent,
    tent.registry,
    tent.foldLegacy,
  );
  registerTestTentFlap(tent.useFlap);
  registerTestTentLantern(tent.lantern);
  registerTestRoofTent(
    roof.placeRoofTent,
    roof.foldRoofTent,
    roof.roofGuard,
    roof.roofOccupants,
    roof.lookup,
    roof.driverOverrides,
  );
}
