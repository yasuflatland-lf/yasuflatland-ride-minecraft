import {
  DutchOvenActions,
  dutchOvenHostedKind,
} from "../../application/camp/dutchOven";
import { EnterRoofTent } from "../../application/camp/enterRoofTent";
import { FirePitActions } from "../../application/camp/firePit";
import { FoldLegacyTents } from "../../application/camp/foldLegacyTents";
import { FoldRoofTent } from "../../application/camp/foldRoofTent";
import {
  GasLanternActions,
  gasLanternHostedKind,
} from "../../application/camp/gasLantern";
import { HitChair } from "../../application/camp/hitChair";
import { HitTable } from "../../application/camp/hitTable";
import { LeaveRoofTent } from "../../application/camp/leaveRoofTent";
import { PaintRoofTent } from "../../application/camp/paintRoofTent";
import { PaintTent } from "../../application/camp/paintTent";
import { PitchTent } from "../../application/camp/pitchTent";
import { PlaceChair } from "../../application/camp/placeChair";
import { PlaceRoofTent } from "../../application/camp/placeRoofTent";
import { PlaceTable } from "../../application/camp/placeTable";
import { RoofTentHostGuard } from "../../application/camp/roofTentHostGuard";
import { RoofTentMenu } from "../../application/camp/roofTentMenu";
import { SleepInRoofTent } from "../../application/camp/sleepInRoofTent";
import { SwitchLantern } from "../../application/camp/switchLantern";
import { TakeDownTent } from "../../application/camp/takeDownTent";
import { UseTentFlap } from "../../application/camp/useTentFlap";
import { GiveStarterItem } from "../../application/shared/giveStarterItem";
import { HostedItemsGuard } from "../../application/shared/hostedItemsGuard";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../application/shared/ports/vehicleHost";
import { SleepInBed } from "../../application/shared/sleepInBed";
import { registerBedBlock } from "../shared/bedBlock";
import { BedrockBedWorld } from "../shared/bedrockBedWorld";
import { registerLaidBlockGuard } from "../shared/laidBlockGuard";
import { playerById } from "../shared/players";
import {
  BedrockStarterItemWorld,
  registerStarterItem,
} from "../shared/starterItem";
import type { SwitchTarget } from "../shared/switchRouter";
import type { PlaceHostedOnTop } from "../shared/tableTop/hosted";
import type { TopHostRegistry } from "../shared/tableTop/registry";
import { BedrockChairWorld } from "./bedrock/bedrockChairWorld";
import { BedrockDutchOvenWorld } from "./bedrock/bedrockDutchOvenWorld";
import { BedrockFirePitWorld } from "./bedrock/bedrockFirePitWorld";
import { BedrockGasLanternWorld } from "./bedrock/bedrockGasLanternWorld";
import { BedrockLanternWorld } from "./bedrock/bedrockLanternWorld";
import { BedrockRoofTentOccupantWorld } from "./bedrock/bedrockRoofTentOccupantWorld";
import { BedrockRoofTentWorld } from "./bedrock/bedrockRoofTentWorld";
import { BedrockTableWorld } from "./bedrock/bedrockTableWorld";
import { BedrockTentPaintWorld } from "./bedrock/bedrockTentPaintWorld";
import { BedrockTentWorld } from "./bedrock/bedrockTentWorld";
import { createGasLanternLight } from "./bedrock/gasLanternLight";
import { gasLanternSwitchTarget } from "./bedrock/gasLanternSwitch";
import { registerDutchOven } from "./bedrock/handlers/dutchOven";
import { registerFirePit } from "./bedrock/handlers/firePit";
import { registerGasLantern } from "./bedrock/handlers/gasLantern";
import { registerChairHits } from "./bedrock/handlers/hits";
import { registerChairPlacement } from "./bedrock/handlers/placement";
import { registerRoofTentEnter } from "./bedrock/handlers/roofTentEnter";
import { registerRoofTentHits } from "./bedrock/handlers/roofTentHits";
import { registerRoofTentLifecycle } from "./bedrock/handlers/roofTentLifecycle";
import { createRoofTentMenu } from "./bedrock/handlers/roofTentMenu";
import { registerRoofTentOccupantCleanup } from "./bedrock/handlers/roofTentOccupantCleanup";
import { registerRoofTentPlacement } from "./bedrock/handlers/roofTentPlacement";
import { registerTable } from "./bedrock/handlers/table";
import { registerTentFlap } from "./bedrock/handlers/tentFlap";
import { registerTentHits } from "./bedrock/handlers/tentHits";
import { registerTentLifecycle } from "./bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "./bedrock/handlers/tentLoop";
import { registerTentPlacement } from "./bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "./bedrock/handlers/testHit";
import { registerTestRoofTent } from "./bedrock/handlers/testRoofTent";
import { registerTestTent } from "./bedrock/handlers/testTent";
import { registerTestTentFlap } from "./bedrock/handlers/testTentFlap";
import { registerTestTentLantern } from "./bedrock/handlers/testTentLantern";
import { lanternSwitchTarget } from "./bedrock/lanternSwitch";
import {
  createEntranceReach,
  createHostedTents,
} from "./bedrock/roofTentAccess";
import { RoofTentHosts } from "./bedrock/roofTentHosts";
import { createTentBlocks } from "./bedrock/tentBlocks";
import { TentFlapStore } from "./bedrock/tentFlapStore";
import { registerCampTopHosts } from "./bedrock/topHosts";
import {
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  TENT_MATTRESS_COMPONENT,
} from "./identifiers";
import { DynamicPropertyTentRegistry } from "./persistence/tentRegistry";

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
  registerCampTopHosts(deps.topHosts);
  registerStarterItem(
    new GiveStarterItem(
      new BedrockStarterItemWorld(
        ROOF_TENT_ITEM,
        ROOF_TENT_STARTER_RECEIVED_PROPERTY,
      ),
    ),
  );
  const chairs = new BedrockChairWorld(deps);
  const hitChair = new HitChair(chairs);
  registerChairPlacement(new PlaceChair(chairs));
  registerChairHits(hitChair);
  registerTestChairHit(hitChair);
  const tables = new BedrockTableWorld(deps);
  registerTable(new PlaceTable(tables), new HitTable(tables));
  const firePits = new BedrockFirePitWorld(deps);
  const ovens = new BedrockDutchOvenWorld(deps);
  const gasLanternWorld = new BedrockGasLanternWorld(
    deps,
    createGasLanternLight(),
  );
  const placeOvenOnTop = registerDutchOven(
    new DutchOvenActions(ovens),
    new HostedItemsGuard([
      dutchOvenHostedKind(ovens),
      gasLanternHostedKind(gasLanternWorld),
    ]),
    deps.topHosts,
  );
  registerFirePit(new FirePitActions(firePits), firePits);
  const gasLanterns = new GasLanternActions(gasLanternWorld);
  const placeLanternOnTop = registerGasLantern(
    gasLanterns,
    gasLanternWorld,
    deps.topHosts,
  );

  // SleepInBed is stateless, so camp builds its own instead of sharing the vehicle's.
  registerBedBlock(
    TENT_MATTRESS_COMPONENT,
    new SleepInBed(new BedrockBedWorld({ player: playerById })),
  );

  const registry = new DynamicPropertyTentRegistry();
  const blocks = createTentBlocks();
  const flaps = new TentFlapStore();
  const tents = new BedrockTentWorld({
    isVehicleSpace: deps.isVehicleSpace,
    registry,
    blocks,
    flaps,
  });
  const roofHosts = new RoofTentHosts(deps.vehicleHost);
  const roofOccupants = new BedrockRoofTentOccupantWorld(
    roofHosts.lookup,
    new BedrockBedWorld({ player: playerById }),
    deps.isVehicleSpace,
  );
  const roofTents = new BedrockRoofTentWorld({
    isVehicleSpace: deps.isVehicleSpace,
    isCampSpace: (d, c) => tents.isCampSpace(d, c),
    spawned: (entity, yaw) => roofOccupants.remember(entity, true, yaw),
    beforeRemove: (id) => {
      roofOccupants.eject(id);
      roofOccupants.removed(id, undefined);
    },
  });
  const placeRoofTent = new PlaceRoofTent(roofTents, roofHosts.lookup);
  const foldRoofTent = new FoldRoofTent(roofTents);
  const roofGuard = new RoofTentHostGuard(
    roofTents,
    roofHosts.lookup,
    roofOccupants,
    roofOccupants,
  );
  const sleep = new SleepInRoofTent(
    roofOccupants,
    new SleepInBed(new BedrockBedWorld({ player: playerById })),
  );
  const leave = new LeaveRoofTent(roofOccupants);
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
  registerRoofTentLifecycle(roofOccupants, roofGuard, roofHosts);
  registerTestRoofTent(
    placeRoofTent,
    foldRoofTent,
    roofGuard,
    roofOccupants,
    roofHosts,
  );

  const pitchTent = new PitchTent(tents);
  const takeDownTent = new TakeDownTent(tents);
  const foldLegacy = new FoldLegacyTents(tents);
  const paintTent = new PaintTent(new BedrockTentPaintWorld());
  const tentBlockOwner = tents.tentBlockOwner.bind(tents);
  registerTentPlacement(pitchTent);
  registerTentHits(takeDownTent, paintTent, tentBlockOwner);
  registerLaidBlockGuard(tentBlockOwner);
  registerLaidBlockGuard(roofOccupants.ceilingOwner.bind(roofOccupants));
  registerTentLoop(registry, blocks, flaps, foldLegacy);
  registerTentLifecycle(registry, blocks);
  registerTestTent(pitchTent, takeDownTent, registry, foldLegacy);
  const useFlap = new UseTentFlap(tents);
  registerTentFlap(useFlap, (d, c) => tents.flapAt(d, c));
  registerTestTentFlap(useFlap);
  const lantern = new SwitchLantern(new BedrockLanternWorld());
  registerTestTentLantern(lantern);
  return {
    // The chair claims no space; the tents claim their footprints (ADR 0129).
    isCampSpace: (d, c) => tents.isCampSpace(d, c),
    placeHostedOnTop: (player, host) =>
      placeLanternOnTop(player, host) || placeOvenOnTop(player, host),
    switchTargets: [
      lanternSwitchTarget(lantern, (d, feet) => tents.tentContaining(d, feet)),
      gasLanternSwitchTarget(gasLanterns),
    ],
  };
}
