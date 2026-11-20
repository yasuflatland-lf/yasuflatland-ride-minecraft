import {
  DutchOvenActions,
  dutchOvenHostedKind,
} from "../../../application/camp/dutchOven";
import { FirePitActions } from "../../../application/camp/firePit";
import {
  GasLanternActions,
  gasLanternHostedKind,
} from "../../../application/camp/gasLantern";
import { HitChair } from "../../../application/camp/hitChair";
import { HitTable } from "../../../application/camp/hitTable";
import { PlaceChair } from "../../../application/camp/placeChair";
import { PlaceTable } from "../../../application/camp/placeTable";
import { HostedItemsGuard } from "../../../application/shared/hostedItemsGuard";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import type { VehicleHostLookup } from "../../../application/shared/ports/vehicleHost";
import type { SwitchTarget } from "../../shared/switchRouter";
import type { PlaceHostedOnTop } from "../../shared/tableTop/hosted";
import type { TopHostRegistry } from "../../shared/tableTop/registry";
import { BedrockChairWorld } from "../bedrock/bedrockChairWorld";
import { BedrockDutchOvenWorld } from "../bedrock/bedrockDutchOvenWorld";
import { BedrockFirePitWorld } from "../bedrock/bedrockFirePitWorld";
import { BedrockGasLanternWorld } from "../bedrock/bedrockGasLanternWorld";
import { BedrockTableWorld } from "../bedrock/bedrockTableWorld";
import { createGasLanternLight } from "../bedrock/gasLanternLight";
import { gasLanternSwitchTarget } from "../bedrock/gasLanternSwitch";
import { registerDutchOven } from "../bedrock/handlers/dutchOven";
import { registerFirePit } from "../bedrock/handlers/firePit";
import { registerGasLantern } from "../bedrock/handlers/gasLantern";
import { registerChairHits } from "../bedrock/handlers/hits";
import { registerChairPlacement } from "../bedrock/handlers/placement";
import { registerTable } from "../bedrock/handlers/table";
import { registerTestChairHit } from "../bedrock/handlers/testHit";
import { registerCampTopHosts } from "../bedrock/topHosts";

export function installCampGear(deps: {
  topHosts: TopHostRegistry;
  isVehicleSpace: SpaceCheck;
  vehicleHost: VehicleHostLookup;
}): {
  placeHostedOnTop: PlaceHostedOnTop;
  gasLanternSwitchTarget: SwitchTarget;
} {
  registerCampTopHosts(deps.topHosts);
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

  return {
    placeHostedOnTop: (player, host) =>
      placeLanternOnTop(player, host) || placeOvenOnTop(player, host),
    gasLanternSwitchTarget: gasLanternSwitchTarget(gasLanterns),
  };
}
