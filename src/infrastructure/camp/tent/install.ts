import { FoldLegacyTents } from "../../../application/camp/foldLegacyTents";
import { PitchTent } from "../../../application/camp/pitchTent";
import { SwitchLantern } from "../../../application/camp/switchLantern";
import { TakeDownTent } from "../../../application/camp/takeDownTent";
import { UseTentFlap } from "../../../application/camp/useTentFlap";
import type { SpaceCheck } from "../../../application/shared/ports/space";
import { Repaint } from "../../../application/shared/repaint";
import type { SleepInBed } from "../../../application/shared/sleepInBed";
import { TENT_SPEC } from "../../../domain/camp/spec";
import type { TentId } from "../../../domain/camp/tent";
import { registerBedBlock } from "../../shared/bedBlock";
import { BedrockVariantPaintWorld } from "../../shared/dyes";
import type { LaidBlockOwner } from "../../shared/laidBlockGuard";
import { registerLaidBlockGuard } from "../../shared/laidBlockGuard";
import { BedrockLanternWorld } from "../bedrock/bedrockLanternWorld";
import { BedrockTentWorld } from "../bedrock/bedrockTentWorld";
import { registerTentFlap } from "../bedrock/handlers/tentFlap";
import { registerTentHits } from "../bedrock/handlers/tentHits";
import { registerTentLifecycle } from "../bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "../bedrock/handlers/tentLoop";
import { registerTentPlacement } from "../bedrock/handlers/tentPlacement";
import { lanternSwitchTarget } from "../bedrock/lanternSwitch";
import { createTentBlocks } from "../bedrock/tentBlocks";
import { TentFlapStore } from "../bedrock/tentFlapStore";
import { TENT_MATTRESS_COMPONENT, TENT_TYPE } from "../identifiers";
import { DynamicPropertyTentRegistry } from "../persistence/tentRegistry";

export interface TentParts {
  readonly world: BedrockTentWorld;
  readonly registry: DynamicPropertyTentRegistry;
  readonly blocks: ReturnType<typeof createTentBlocks>;
  readonly flaps: TentFlapStore;
}

/** Builds the tent world without registering handlers. */
export function createTents(deps: { isVehicleSpace: SpaceCheck }): TentParts {
  const registry = new DynamicPropertyTentRegistry();
  const blocks = createTentBlocks();
  const flaps = new TentFlapStore();
  const world = new BedrockTentWorld({
    isVehicleSpace: deps.isVehicleSpace,
    registry,
    blocks,
    flaps,
  });
  return { world, registry, blocks, flaps };
}

export function installTents(
  { world, registry, blocks, flaps }: TentParts,
  deps: {
    sleep: SleepInBed;
    laterLaidBlockOwners: readonly LaidBlockOwner[];
  },
) {
  registerBedBlock(TENT_MATTRESS_COMPONENT, deps.sleep);
  const pitchTent = new PitchTent(world);
  const takeDownTent = new TakeDownTent(world);
  const foldLegacy = new FoldLegacyTents(world);
  const paintTent = new Repaint(
    new BedrockVariantPaintWorld<TentId>(TENT_TYPE, TENT_SPEC.defaultPaint),
  );
  const tentBlockOwner = world.tentBlockOwner.bind(world);
  registerTentPlacement(pitchTent);
  registerTentHits(takeDownTent, paintTent, tentBlockOwner);
  registerLaidBlockGuard(tentBlockOwner);
  for (const owner of deps.laterLaidBlockOwners) registerLaidBlockGuard(owner);
  registerTentLoop(registry, blocks, flaps, foldLegacy);
  registerTentLifecycle(registry, blocks);
  const useFlap = new UseTentFlap(world);
  registerTentFlap(useFlap, (d, c) => world.flapAt(d, c));
  const lantern = new SwitchLantern(new BedrockLanternWorld());
  return {
    lanternSwitchTarget: lanternSwitchTarget(lantern, (d, feet) =>
      world.tentContaining(d, feet),
    ),
    pitchTent,
    takeDownTent,
    registry,
    foldLegacy,
    useFlap,
    lantern,
  };
}
