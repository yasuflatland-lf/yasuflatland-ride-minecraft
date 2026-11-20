import type { SpaceCheck } from "../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../application/shared/ports/vehicleHost";
import { SleepInBed } from "../../application/shared/sleepInBed";
import { BedrockBedWorld } from "../shared/bedrockBedWorld";
import { playerById } from "../shared/players";
import type { SwitchTarget } from "../shared/switchRouter";
import type { PlaceHostedOnTop } from "../shared/tableTop/hosted";
import type { TopHostRegistry } from "../shared/tableTop/registry";
import { installCampGear } from "./gear/install";
import { installRoofTents } from "./roofTent/install";
import { createTents, installTents } from "./tent/install";

/**
 * `isVehicleSpace` comes from the vehicle feature through bootstrap, since camp
 * cannot import it, and `switchTargets` goes back through it to the vehicles'
 * switch router (ADR 0046).
 */
export function installCamp(deps: {
  topHosts: TopHostRegistry;
  isVehicleSpace: SpaceCheck;
  vehicleHost: VehicleHostLookup;
}): {
  isCampSpace: SpaceCheck;
  switchTargets: readonly SwitchTarget[];
  placeHostedOnTop: PlaceHostedOnTop;
} {
  const gear = installCampGear(deps);
  const beds = new BedrockBedWorld({ player: playerById });
  const sleep = new SleepInBed(beds);
  const tents = createTents(deps);
  // The chair claims no space; the tents claim their footprints (ADR 0129).
  const isCampSpace: SpaceCheck = (d, c) => tents.world.isCampSpace(d, c);
  const roof = installRoofTents({ ...deps, isCampSpace, beds, sleep });
  const { lanternSwitchTarget } = installTents(tents, {
    sleep,
    laterLaidBlockOwners: [roof.ceilingOwner],
  });
  return {
    isCampSpace,
    placeHostedOnTop: gear.placeHostedOnTop,
    switchTargets: [lanternSwitchTarget, gear.gasLanternSwitchTarget],
  };
}
