// Wires the camp feature: the low chair placed outside the vehicles (ADR 0122)
// and the tent pitched from its item, with flaps that open alone (ADR 0131, 0132),
// mattresses to sleep on (ADR 0133), and a lantern on the headlight switch (ADR 0134).
import { HitChair } from "../../application/camp/hitChair";
import { PitchTent } from "../../application/camp/pitchTent";
import { PlaceChair } from "../../application/camp/placeChair";
import { SwitchLantern } from "../../application/camp/switchLantern";
import { TakeDownTent } from "../../application/camp/takeDownTent";
import { UseTentFlap } from "../../application/camp/useTentFlap";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { SleepInBed } from "../../application/shared/sleepInBed";
import { registerBedBlock } from "../shared/bedBlock";
import { BedrockBedWorld } from "../shared/bedrockBedWorld";
import { registerLaidBlockGuard } from "../shared/laidBlockGuard";
import { playerById } from "../shared/players";
import type { SwitchTarget } from "../shared/switchRouter";
import { BedrockChairWorld } from "./bedrock/bedrockChairWorld";
import { BedrockLanternWorld } from "./bedrock/bedrockLanternWorld";
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
import { registerTestTentLantern } from "./bedrock/handlers/testTentLantern";
import { lanternSwitchTarget } from "./bedrock/lanternSwitch";
import { createTentBlocks } from "./bedrock/tentBlocks";
import { TentFlapStore } from "./bedrock/tentFlapStore";
import { TENT_MATTRESS_COMPONENT } from "./identifiers";
import { DynamicPropertyTentRegistry } from "./persistence/tentRegistry";

/**
 * `isVehicleSpace` comes from the vehicle feature through bootstrap, since camp
 * cannot import it, and `switchTargets` goes back through it to the vehicles'
 * switch router (ADR 0046).
 */
export function installCamp(deps: { isVehicleSpace: SpaceCheck }): {
  isCampSpace: SpaceCheck;
  switchTargets: readonly SwitchTarget[];
} {
  const chairs = new BedrockChairWorld(deps);
  const hitChair = new HitChair(chairs);
  registerChairPlacement(new PlaceChair(chairs));
  registerChairHits(hitChair);
  registerTestChairHit(hitChair);

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
  const lantern = new SwitchLantern(new BedrockLanternWorld());
  registerTestTentLantern(lantern);
  return {
    // The chair claims no space; the tents claim their footprints (ADR 0129).
    isCampSpace: (d, c) => tents.isCampSpace(d, c),
    switchTargets: [
      lanternSwitchTarget(lantern, (d, feet) => tents.tentContaining(d, feet)),
    ],
  };
}
