// Wires the camp feature: the low chair placed outside the vehicles (ADR 0122)
// and the tent pitched from its item with flaps that open alone (ADR 0131, 0132).
import { HitChair } from "../../application/camp/hitChair";
import { PitchTent } from "../../application/camp/pitchTent";
import { PlaceChair } from "../../application/camp/placeChair";
import { TakeDownTent } from "../../application/camp/takeDownTent";
import { UseTentFlap } from "../../application/camp/useTentFlap";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { registerLaidBlockGuard } from "../shared/laidBlockGuard";
import { BedrockChairWorld } from "./bedrock/bedrockChairWorld";
import { BedrockTentWorld } from "./bedrock/bedrockTentWorld";
import { registerChairHits } from "./bedrock/handlers/hits";
import { registerChairPlacement } from "./bedrock/handlers/placement";
import { registerTentFlap } from "./bedrock/handlers/tentFlap";
import { registerTentHits } from "./bedrock/handlers/tentHits";
import { registerTentLifecycle } from "./bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "./bedrock/handlers/tentLoop";
import { registerTentPlacement } from "./bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "./bedrock/handlers/testHit";
import { registerTestTent } from "./bedrock/handlers/testTent";
import { registerTestTentFlap } from "./bedrock/handlers/testTentFlap";
import { createTentBlocks } from "./bedrock/tentBlocks";
import { TentFlapStore } from "./bedrock/tentFlapStore";
import { DynamicPropertyTentRegistry } from "./persistence/tentRegistry";

/** `isVehicleSpace` comes from the vehicle feature through bootstrap, since camp cannot import it (ADR 0046). */
export function installCamp(deps: { isVehicleSpace: SpaceCheck }): {
  isCampSpace: SpaceCheck;
} {
  const chairs = new BedrockChairWorld(deps);
  const hitChair = new HitChair(chairs);
  registerChairPlacement(new PlaceChair(chairs));
  registerChairHits(hitChair);
  registerTestChairHit(hitChair);

  const registry = new DynamicPropertyTentRegistry();
  const blocks = createTentBlocks();
  const flaps = new TentFlapStore();
  const tents = new BedrockTentWorld({
    isVehicleSpace: deps.isVehicleSpace,
    registry,
    blocks,
    flaps,
  });
  const pitchTent = new PitchTent(tents);
  const takeDownTent = new TakeDownTent(tents);
  const tentBlockOwner = tents.tentBlockOwner.bind(tents);
  registerTentPlacement(pitchTent);
  registerTentHits(takeDownTent, tentBlockOwner);
  registerLaidBlockGuard(tentBlockOwner);
  registerTentLoop(registry, blocks, flaps);
  registerTentLifecycle(registry, blocks);
  registerTestTent(pitchTent, takeDownTent);
  const useFlap = new UseTentFlap(tents);
  registerTentFlap(useFlap, (d, c) => tents.flapAt(d, c));
  registerTestTentFlap(useFlap);
  // The chair claims no space; the tents claim their footprints (ADR 0129).
  return { isCampSpace: (d, c) => tents.isCampSpace(d, c) };
}
