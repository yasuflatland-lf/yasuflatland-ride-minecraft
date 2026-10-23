// Wires the camp feature: the low chair placed outside the vehicles (ADR 0122).
import { HitChair } from "../../application/camp/hitChair";
import { PlaceChair } from "../../application/camp/placeChair";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BedrockChairWorld } from "./bedrock/bedrockChairWorld";
import { registerChairHits } from "./bedrock/handlers/hits";
import { registerChairPlacement } from "./bedrock/handlers/placement";
import { registerTestChairHit } from "./bedrock/handlers/testHit";

/** `isVehicleSpace` comes from the vehicle feature through bootstrap, since camp cannot import it (ADR 0046). */
export function installCamp(deps: { isVehicleSpace: SpaceCheck }): {
  isCampSpace: SpaceCheck;
} {
  const chairs = new BedrockChairWorld(deps);
  const hitChair = new HitChair(chairs);
  registerChairPlacement(new PlaceChair(chairs));
  registerChairHits(hitChair);
  registerTestChairHit(hitChair);
  // The low chair claims no space; the tent's cells will (ADR 0129).
  return { isCampSpace: () => false };
}
