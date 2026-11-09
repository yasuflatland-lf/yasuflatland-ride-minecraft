import { system, world } from "@minecraft/server";
import type { LieOnBeachChair } from "../../../../application/resort/lieOnBeachChair";
import {
  asBeachChairId,
  type BeachChairId,
} from "../../../../domain/resort/ids";
import { BEACH_CHAIR_SPEC } from "../../../../domain/resort/spec";
import { BEACH_CHAIR } from "../../identifiers";

export function registerBeachChairLifecycle(riders: LieOnBeachChair): void {
  system.runInterval(() => {
    const loaded: BeachChairId[] = [];
    for (const name of ["overworld", "nether", "the_end"])
      for (const entity of world
        .getDimension(name)
        .getEntities({ type: BEACH_CHAIR }))
        loaded.push(asBeachChairId(entity.id));
    riders.refresh(loaded);
  }, BEACH_CHAIR_SPEC.poseRefreshTicks);
}
