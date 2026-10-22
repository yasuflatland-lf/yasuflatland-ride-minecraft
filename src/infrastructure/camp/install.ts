// Wires the camp feature: the low chair placed outside the vehicles (ADR 0121).
import { HitChair } from "../../application/camp/hitChair";
import { PlaceChair } from "../../application/camp/placeChair";
import type { DimensionId } from "../../domain/shared/ids";
import type { Vec3 } from "../../domain/shared/vec";
import { BedrockChairWorld } from "./bedrock/bedrockChairWorld";
import { registerChairHits } from "./bedrock/handlers/hits";
import { registerChairPlacement } from "./bedrock/handlers/placement";
import { registerTestChairHit } from "./bedrock/handlers/testHit";

/** `isVehicleSpace` comes from the vehicle feature through bootstrap, since camp cannot import it (ADR 0046). */
export function installCamp(deps: {
  isVehicleSpace(dimensionId: DimensionId, cell: Vec3): boolean;
}): void {
  const chairs = new BedrockChairWorld(deps);
  const hitChair = new HitChair(chairs);
  registerChairPlacement(new PlaceChair(chairs));
  registerChairHits(hitChair);
  registerTestChairHit(hitChair);
}
