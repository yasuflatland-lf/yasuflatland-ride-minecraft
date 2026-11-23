import { EnterRoofTent } from "../../../application/camp/enterRoofTent";
import { FoldRoofTent } from "../../../application/camp/foldRoofTent";
import { LeaveRoofTent } from "../../../application/camp/leaveRoofTent";
import { PaintRoofTent } from "../../../application/camp/paintRoofTent";
import { PlaceRoofTent } from "../../../application/camp/placeRoofTent";
import { RoofTentHostGuard } from "../../../application/camp/roofTentHostGuard";
import { RoofTentMenu } from "../../../application/camp/roofTentMenu";
import {
  ClearRoofTentSpawn,
  RoofTentCleanup,
} from "../../../application/camp/roofTentRemoved";
import { SleepInRoofTent } from "../../../application/camp/sleepInRoofTent";
import { GiveStarterItem } from "../../../application/shared/giveStarterItem";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import type { SleepInBed } from "../../../application/shared/sleepInBed";
import type { BedrockBedWorld } from "../../shared/bedrockBedWorld";
import { consoleLogger } from "../../shared/consoleLogger";
import type { LaidBlockOwner } from "../../shared/laidBlockGuard";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../../shared/starterItem";
import { BedrockRoofTentOccupantWorld } from "../bedrock/bedrockRoofTentOccupantWorld";
import { BedrockRoofTentWorld } from "../bedrock/bedrockRoofTentWorld";
import { registerRoofTentEnter } from "../bedrock/handlers/roofTentEnter";
import { registerRoofTentHits } from "../bedrock/handlers/roofTentHits";
import { registerRoofTentLifecycle } from "../bedrock/handlers/roofTentLifecycle";
import { createRoofTentMenu } from "../bedrock/handlers/roofTentMenu";
import { registerRoofTentOccupantCleanup } from "../bedrock/handlers/roofTentOccupantCleanup";
import { registerRoofTentPlacement } from "../bedrock/handlers/roofTentPlacement";
import { registerTestRoofTent } from "../bedrock/handlers/testRoofTent";
import {
  createEntranceReach,
  createHostedTents,
} from "../bedrock/roofTentAccess";
import { RoofTentHosts } from "../bedrock/roofTentHosts";
import {
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
} from "../identifiers";

export function installRoofTents(deps: {
  isVehicleSpace: SpaceCheck;
  isCampSpace: SpaceCheck;
  vehicleHost: VehicleHostLookup;
  beds: BedrockBedWorld;
  sleep: SleepInBed;
}): { ceilingOwner: LaidBlockOwner } {
  registerStarterItem(
    new GiveStarterItem(
      new BedrockStarterItemWorld(
        ROOF_TENT_ITEM,
        ROOF_TENT_STARTER_RECEIVED_PROPERTY,
      ),
    ),
  );
  const roofHosts = new RoofTentHosts(deps.vehicleHost);
  const roofOccupants = new BedrockRoofTentOccupantWorld(
    roofHosts.lookup,
    deps.isVehicleSpace,
    deps.isCampSpace,
  );
  const leave = new LeaveRoofTent(roofOccupants);
  const cleanup = new RoofTentCleanup(
    roofOccupants,
    leave,
    new ClearRoofTentSpawn(roofOccupants, deps.beds, consoleLogger),
  );
  const roofTents = new BedrockRoofTentWorld({
    isVehicleSpace: deps.isVehicleSpace,
    isCampSpace: deps.isCampSpace,
    spawned: (entity, yaw) => roofOccupants.remember(entity, true, yaw),
    beforeRemove: (id) => cleanup.removed(id, undefined),
  });
  const placeRoofTent = new PlaceRoofTent(roofTents, roofHosts.lookup);
  const foldRoofTent = new FoldRoofTent(roofTents);
  const roofGuard = new RoofTentHostGuard(roofTents, roofHosts.lookup, leave);
  const sleep = new SleepInRoofTent(roofOccupants, deps.sleep);
  const trackOccupant = registerRoofTentOccupantCleanup(
    leave,
    roofOccupants,
    () => roofTents.loaded(),
  );
  registerRoofTentEnter(
    new EnterRoofTent(roofOccupants),
    roofOccupants,
    createRoofTentMenu(new RoofTentMenu(roofOccupants, sleep, leave)),
    trackOccupant,
    createEntranceReach(roofHosts.lookup),
    createHostedTents(roofHosts.lookup),
  );
  registerRoofTentPlacement(placeRoofTent, roofHosts.lookup);
  registerRoofTentHits(foldRoofTent, new PaintRoofTent(roofTents));
  registerRoofTentLifecycle(
    roofOccupants,
    roofGuard,
    roofHosts,
    cleanup,
    (id) => roofTents.isRemoving(id),
  );
  registerTestRoofTent(
    placeRoofTent,
    foldRoofTent,
    roofGuard,
    roofOccupants,
    roofHosts,
  );

  return { ceilingOwner: roofOccupants.ceilingOwner.bind(roofOccupants) };
}
